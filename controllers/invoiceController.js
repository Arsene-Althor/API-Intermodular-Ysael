const Reservation = require('../models/Reservation');
const User = require('../models/User');
const Room = require('../models/Room');
const { streamInvoicePdf } = require('../services/invoicePdfService');

function puedeVerReserva(req, reservaDoc) {
  if (!reservaDoc) return false;
  if (req.user.role === 'admin' || req.user.role === 'employee') return true;
  return reservaDoc.user_id === req.user.user_id;
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
      .select('name surname email user_id')
      .lean();
    const room = await Room.findOne({ room_id: reservation.room_id }).select('type description room_id').lean();

    const filename = `Factura-${reservation.invoice_number}.pdf`;
    streamInvoicePdf(res, filename, reservation, clientUser, room);
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
        'reservation_id invoice_number user_id room_id price checkout_completed_at check_in check_out cancelation_date',
      )
      .lean();
    return res.json(list);
  } catch (err) {
    console.error('listInvoiceHistory', err);
    return res.status(500).json({ error: 'Error al listar facturas', detalle: err.message });
  }
}

module.exports = {
  getInvoicePdf,
  listInvoiceHistory,
};
