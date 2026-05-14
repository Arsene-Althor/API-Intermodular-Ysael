const Reservation = require('../models/Reservation');
const User = require('../models/User');
const Room = require('../models/Room');
const ExtraService = require('../models/ExtraService');
const { streamInvoicePdf, renderInvoicePdfBuffer } = require('../services/invoicePdfService');
const { sendEmail } = require('../config/mailer');

function puedeVerReserva(req, reservaDoc) {
  if (!reservaDoc) return false;
  if (req.user.role === 'admin' || req.user.role === 'employee') return true;
  return reservaDoc.user_id === req.user.user_id;
}

/**
 * GET /reservation/:reservation_id/billing-info
 * Pasarela ficticia: sin cobro real; indica si hay factura y ruta de descarga.
 */
async function getBillingInfo(req, res) {
  try {
    const { reservation_id } = req.params;
    const reservation = await Reservation.findOne({ reservation_id }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    return res.json({
      fictitious_payment_gateway: true,
      message:
        'Pasarela de pago simulada: no se procesan tarjetas ni transferencias. Única acción real disponible: descarga del PDF de factura tras checkout.',
      reservation_id,
      invoice_available: Boolean(reservation.invoice_number),
      invoice_number: reservation.invoice_number || null,
      checkout_completed_at: reservation.checkout_completed_at || null,
      total_ttc: reservation.price,
      download_invoice: reservation.invoice_number
        ? { method: 'GET', path: `/reservation/${reservation_id}/invoice` }
        : null,
    });
  } catch (err) {
    console.error('getBillingInfo', err);
    return res.status(500).json({ error: 'Error al obtener datos de facturación', detalle: err.message });
  }
}

/**
 * GET /reservation/:reservation_id/invoice
 * Cliente: solo su reserva. Personal: cualquiera con factura emitida (post-checkout).
 */
async function getInvoicePdf(req, res) {
  try {
    const { reservation_id } = req.params;
    const reservation = await Reservation.findOne({ reservation_id }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (!reservation.invoice_number) {
      return res.status(400).json({
        error: 'Factura no disponible',
        detalle: 'El checkout aún no se ha completado para esta reserva (sin invoice_number).',
      });
    }

    const clientUser = await User.findOne({ user_id: reservation.user_id })
      .select('name surname email user_id dni billing_company_name billing_company_cif')
      .lean();

    const room = await Room.findOne({ room_id: reservation.room_id })
      .select('type description room_id price_per_night offer_active offer_percent extra_services')
      .lean();

    const ids = Array.isArray(room?.extra_services) ? room.extra_services.map(String).filter(Boolean) : [];
    const extraDocs = ids.length ? await ExtraService.find({ service_id: { $in: ids } }).lean() : [];

    const filename = `Factura-${reservation.invoice_number}.pdf`;
    await streamInvoicePdf(res, filename, reservation, clientUser, room, extraDocs);
  } catch (err) {
    if (err.code === 'NO_INVOICE') {
      return res.status(400).json({ error: 'Sin número de factura' });
    }
    if (res.headersSent) {
      console.error('getInvoicePdf (headers enviados):', err);
      return;
    }
    console.error('getInvoicePdf', err);
    return res.status(500).json({ error: 'Error al generar PDF', detalle: err.message });
  }
}

/**
 * POST /reservation/:reservation_id/invoice/email
 * Solo personal: reenvía el PDF de factura por correo (adjunto). Body opcional: `{ "to": "otro@email.com" }`.
 */
async function postInvoiceEmail(req, res) {
  try {
    const { reservation_id } = req.params;
    const reservation = await Reservation.findOne({ reservation_id }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!reservation.invoice_number) {
      return res.status(400).json({ error: 'Sin factura emitida para esta reserva' });
    }

    const clientUser = await User.findOne({ user_id: reservation.user_id })
      .select('name surname email user_id dni billing_company_name billing_company_cif')
      .lean();

    const overrideTo = req.body?.to ?? req.body?.email;
    const to = String(overrideTo || '').trim() || (clientUser && clientUser.email);
    if (!to) {
      return res.status(400).json({
        error: 'Sin destinatario',
        detalle: 'El usuario de la reserva no tiene email o el body no incluye "to".',
      });
    }

    const room = await Room.findOne({ room_id: reservation.room_id })
      .select('type description room_id price_per_night offer_active offer_percent extra_services')
      .lean();

    const ids = Array.isArray(room?.extra_services) ? room.extra_services.map(String).filter(Boolean) : [];
    const extraDocs = ids.length ? await ExtraService.find({ service_id: { $in: ids } }).lean() : [];

    const buf = await renderInvoicePdfBuffer(reservation, clientUser, room, extraDocs);
    const safeName = `Factura-${String(reservation.invoice_number).replace(/[^\w.-]+/g, '_')}.pdf`;

    const nombre = clientUser ? `${clientUser.name || ''} ${clientUser.surname || ''}`.trim() : 'Cliente';
    const html = `<p>Hola${nombre ? ` ${nombre}` : ''},</p><p>Adjuntamos la factura <strong>${reservation.invoice_number}</strong> correspondiente a la reserva <strong>${reservation.reservation_id}</strong>.</p><p>Saludos,<br/>Hotel Pere María</p>`;

    const sent = await sendEmail(to, `Factura ${reservation.invoice_number}`, html, [
      { filename: safeName, content: buf },
    ]);
    if (!sent) {
      return res.status(502).json({ error: 'No se pudo enviar el correo', detalle: 'Revisar EMAIL_HOST / EMAIL_USER / EMAIL_PASS en .env' });
    }
    return res.json({
      mensaje: 'Correo enviado',
      to,
      invoice_number: reservation.invoice_number,
      reservation_id: reservation.reservation_id,
    });
  } catch (err) {
    if (err.code === 'NO_INVOICE') {
      return res.status(400).json({ error: 'Sin número de factura' });
    }
    console.error('postInvoiceEmail', err);
    return res.status(500).json({ error: 'Error al enviar factura por email', detalle: err.message });
  }
}

/**
 * GET /invoices?userId=… (o ?user_id=…)
 * Reservas con factura emitida (`invoice_number`) para ese usuario.
 * Cliente: solo su propio `userId`. Admin/empleado: cualquier usuario.
 */
async function listInvoicesByUser(req, res) {
  try {
    const raw = req.query.userId ?? req.query.user_id;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return res.status(400).json({ error: 'Falta userId en query (ej. ?userId=CLI-00001)' });
    }
    const userId = String(raw).trim();

    if (req.user.role === 'client' && userId !== req.user.user_id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const list = await Reservation.find({
      user_id: userId,
      invoice_number: { $ne: null, $exists: true, $nin: ['', null] },
    })
      .sort({ checkout_completed_at: -1 })
      .select(
        'reservation_id invoice_number user_id room_id price checkout_completed_at check_in check_out cancelation_date invoice_breakdown',
      )
      .lean();

    return res.json({
      user_id: userId,
      count: list.length,
      reservations: list,
    });
  } catch (err) {
    console.error('listInvoicesByUser', err);
    return res.status(500).json({ error: 'Error al listar facturas por usuario', detalle: err.message });
  }
}

/**
 * GET /reservation/invoices/history
 * Listado de reservas con factura (solo admin / employee).
 */
async function listInvoiceHistory(req, res) {
  try {
    const list = await Reservation.find({
      invoice_number: { $ne: null, $exists: true, $nin: ['', null] },
    })
      .sort({ checkout_completed_at: -1 })
      .select(
        'reservation_id invoice_number user_id room_id price checkout_completed_at check_in check_out cancelation_date invoice_breakdown',
      )
      .lean();
    return res.json(list);
  } catch (err) {
    console.error('listInvoiceHistory', err);
    return res.status(500).json({ error: 'Error al listar facturas', detalle: err.message });
  }
}

module.exports = {
  getBillingInfo,
  getInvoicePdf,
  postInvoiceEmail,
  listInvoicesByUser,
  listInvoiceHistory,
};
