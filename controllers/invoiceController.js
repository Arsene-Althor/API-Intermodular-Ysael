const Reservation = require('../models/Reservation');
const HotelInvoice = require('../models/HotelInvoice');
const User = require('../models/User');
const Room = require('../models/Room');
const ExtraService = require('../models/ExtraService');
const { streamInvoicePdf, streamBookingReceiptPdf, renderInvoicePdfBuffer } = require('../services/invoicePdfService');
const {
  emitHotelInvoice,
  findHotelInvoice,
  syncLegacyInvoicesFromReservations,
  backfillActiveReservationsWithoutInvoice,
  typeLabel,
} = require('../services/invoiceEmissionService');
const { sendEmail } = require('../config/mailer');

async function loadInvoiceContext(reservationId, invoiceNumber) {
  const reservation = await Reservation.findOne({ reservation_id: reservationId }).lean();
  if (!reservation) return { error: 'Reserva no encontrada', status: 404 };
  const hotelInvoice = await findHotelInvoice(reservationId, invoiceNumber);
  if (!hotelInvoice && !reservation.invoice_number) {
    return { error: 'Factura no disponible', status: 400, detalle: 'No hay factura emitida para esta reserva' };
  }
  const clientUser = await User.findOne({ user_id: reservation.user_id })
    .select('name surname email user_id dni billing_company_name billing_company_cif')
    .lean();
  const room = await Room.findOne({ room_id: reservation.room_id })
    .select('type description room_id price_per_night offer_active offer_percent extra_services')
    .lean();
  const ids = Array.isArray(room?.extra_services) ? room.extra_services.map(String).filter(Boolean) : [];
  const extraDocs = ids.length ? await ExtraService.find({ service_id: { $in: ids } }).lean() : [];
  return { reservation, hotelInvoice, clientUser, room, extraDocs };
}

function mapInvoiceRow(inv) {
  return {
    invoice_number: inv.invoice_number,
    reservation_id: inv.reservation_id,
    user_id: inv.user_id,
    room_id: inv.room_id,
    type: inv.type,
    type_label: typeLabel(inv.type),
    amount: inv.amount,
    description: inv.description,
    issued_at: inv.issued_at,
    check_in: inv.check_in || null,
    check_out: inv.check_out || null,
    linked_reservation_id: inv.linked_reservation_id || null,
    invoice_breakdown: inv.invoice_breakdown || null,
  };
}

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

    const invoices = await HotelInvoice.find({ reservation_id })
      .sort({ issued_at: -1 })
      .select('invoice_number type amount issued_at description')
      .lean();

    return res.json({
      fictitious_payment_gateway: true,
      message:
        'Pasarela simulada. Tras pagar la reserva o un suplemento (flexibilidad/ampliación) se emite factura fiscal descargable.',
      reservation_id,
      booking_paid_at: reservation.booking_paid_at || null,
      invoice_available: invoices.length > 0 || Boolean(reservation.invoice_number),
      invoice_number: reservation.invoice_number || null,
      invoices,
      total_ttc: reservation.price,
      download_booking_receipt: {
        method: 'GET',
        path: `/reservation/${encodeURIComponent(reservation_id)}/booking-receipt`,
      },
      download_invoice: invoices.length
        ? {
            method: 'GET',
            path: `/reservation/${reservation_id}/invoice`,
            note: 'Añadir ?invoice_number=FAC-… para una factura concreta',
          }
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
    const invoiceNumber = req.query.invoice_number || req.query.invoiceNumber;
    const reservation = await Reservation.findOne({ reservation_id }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const ctx = await loadInvoiceContext(reservation_id, invoiceNumber);
    if (ctx.error) {
      return res.status(ctx.status).json({ error: ctx.error, detalle: ctx.detalle });
    }

    const invNum = ctx.hotelInvoice?.invoice_number || ctx.reservation.invoice_number;
    const filename = `Factura-${invNum}.pdf`;
    await streamInvoicePdf(
      res,
      filename,
      ctx.reservation,
      ctx.clientUser,
      ctx.room,
      ctx.extraDocs,
      ctx.hotelInvoice,
    );
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
 * GET /reservation/:reservation_id/booking-receipt
 * Justificante PDF no fiscal (pago simulado / confirmación de reserva). Disponible sin checkout.
 */
async function getBookingReceiptPdf(req, res) {
  try {
    const { reservation_id } = req.params;
    const reservation = await Reservation.findOne({ reservation_id }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const clientUser = await User.findOne({ user_id: reservation.user_id })
      .select('name surname email user_id dni billing_company_name billing_company_cif')
      .lean();

    const room = await Room.findOne({ room_id: reservation.room_id })
      .select('type description room_id price_per_night offer_active offer_percent extra_services')
      .lean();

    const filename = `Justificante-${reservation_id}.pdf`;
    await streamBookingReceiptPdf(res, filename, reservation, clientUser, room);
  } catch (err) {
    if (res.headersSent) {
      console.error('getBookingReceiptPdf (headers enviados):', err);
      return;
    }
    console.error('getBookingReceiptPdf', err);
    return res.status(500).json({ error: 'Error al generar justificante', detalle: err.message });
  }
}

/**
 * POST /reservation/:reservation_id/invoice/email
 * Solo personal: reenvía el PDF de factura por correo (adjunto). Body opcional: `{ "to": "otro@email.com" }`.
 */
async function postInvoiceEmail(req, res) {
  try {
    const { reservation_id } = req.params;
    const invoiceNumber = req.body?.invoice_number || req.query.invoice_number;
    const reservation = await Reservation.findOne({ reservation_id }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });

    const ctx = await loadInvoiceContext(reservation_id, invoiceNumber);
    if (ctx.error) {
      return res.status(ctx.status).json({ error: ctx.error, detalle: ctx.detalle });
    }

    const invNum = ctx.hotelInvoice?.invoice_number || ctx.reservation.invoice_number;
    const clientUser = ctx.clientUser;

    const overrideTo = req.body?.to ?? req.body?.email;
    const to = String(overrideTo || '').trim() || (clientUser && clientUser.email);
    if (!to) {
      return res.status(400).json({
        error: 'Sin destinatario',
        detalle: 'El usuario de la reserva no tiene email o el body no incluye "to".',
      });
    }

    const buf = await renderInvoicePdfBuffer(
      ctx.reservation,
      clientUser,
      ctx.room,
      ctx.extraDocs,
      ctx.hotelInvoice,
    );
    const safeName = `Factura-${String(invNum).replace(/[^\w.-]+/g, '_')}.pdf`;

    const nombre = clientUser ? `${clientUser.name || ''} ${clientUser.surname || ''}`.trim() : 'Cliente';
    const html = `<p>Hola${nombre ? ` ${nombre}` : ''},</p><p>Adjuntamos la factura <strong>${invNum}</strong> correspondiente a la reserva <strong>${reservation.reservation_id}</strong>.</p><p>Saludos,<br/>Hotel Pere María</p>`;

    const sent = await sendEmail(to, `Factura ${invNum}`, html, [
      { filename: safeName, content: buf },
    ]);
    if (!sent) {
      return res.status(502).json({ error: 'No se pudo enviar el correo', detalle: 'Revisar EMAIL_HOST / EMAIL_USER / EMAIL_PASS en .env' });
    }
    return res.json({
      mensaje: 'Correo enviado',
      to,
      invoice_number: invNum,
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

    const list = await HotelInvoice.find({ user_id: userId }).sort({ issued_at: -1 }).lean();
    const resIds = [...new Set(list.map((i) => i.reservation_id))];
    const resMap = {};
    if (resIds.length) {
      const rows = await Reservation.find({ reservation_id: { $in: resIds } })
        .select('reservation_id check_in check_out cancelation_date')
        .lean();
      for (const r of rows) resMap[r.reservation_id] = r;
    }

    const invoices = list.map((inv) => {
      const r = resMap[inv.reservation_id];
      return mapInvoiceRow({
        ...inv,
        check_in: r?.check_in,
        check_out: r?.check_out,
      });
    });

    return res.json({
      user_id: userId,
      count: invoices.length,
      invoices,
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
    await syncLegacyInvoicesFromReservations();
    await backfillActiveReservationsWithoutInvoice();
    const list = await HotelInvoice.find({}).sort({ issued_at: -1 }).lean();
    const resIds = [...new Set(list.map((i) => i.reservation_id))];
    const resMap = {};
    if (resIds.length) {
      const rows = await Reservation.find({ reservation_id: { $in: resIds } })
        .select('reservation_id check_in check_out checkout_completed_at cancelation_date price')
        .lean();
      for (const r of rows) resMap[r.reservation_id] = r;
    }
    const out = list.map((inv) => {
      const r = resMap[inv.reservation_id];
      return mapInvoiceRow({
        ...inv,
        check_in: r?.check_in,
        check_out: r?.check_out,
        checkout_completed_at: r?.checkout_completed_at,
        price: r?.price,
      });
    });
    return res.json(out);
  } catch (err) {
    console.error('listInvoiceHistory', err);
    return res.status(500).json({ error: 'Error al listar facturas', detalle: err.message });
  }
}

/**
 * POST /reservation/:reservation_id/confirm-payment
 * Tras pago simulado en app: emite factura fiscal de la reserva.
 */
async function confirmPayment(req, res) {
  try {
    const { reservation_id } = req.params;
    const reservation = await Reservation.findOne({ reservation_id });
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (reservation.cancelation_date) {
      return res.status(400).json({ error: 'Reserva cancelada' });
    }

    const amount = req.body?.amount != null ? Number(req.body.amount) : Number(reservation.price);
    const { invoice } = await emitHotelInvoice({
      reservationId: reservation_id,
      type: 'reservation',
      amount,
    });

    return res.json({
      mensaje: 'Pago confirmado y factura emitida',
      reservation_id,
      invoice_number: invoice.invoice_number,
      amount: invoice.amount,
      issued_at: invoice.issued_at,
      download_invoice: {
        method: 'GET',
        path: `/reservation/${reservation_id}/invoice?invoice_number=${encodeURIComponent(invoice.invoice_number)}`,
      },
    });
  } catch (err) {
    if (err.status === 409 && err.existing) {
      return res.json({
        mensaje: 'Factura de reserva ya existía',
        reservation_id: req.params.reservation_id,
        invoice_number: err.existing.invoice_number,
        amount: err.existing.amount,
        issued_at: err.existing.issued_at,
      });
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('confirmPayment', err);
    return res.status(500).json({ error: 'Error al confirmar pago', detalle: err.message });
  }
}

module.exports = {
  getBillingInfo,
  getInvoicePdf,
  getBookingReceiptPdf,
  postInvoiceEmail,
  listInvoicesByUser,
  listInvoiceHistory,
  confirmPayment,
};
