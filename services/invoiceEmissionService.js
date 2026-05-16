const Reservation = require('../models/Reservation');
const HotelInvoice = require('../models/HotelInvoice');
const User = require('../models/User');
const Room = require('../models/Room');
const ExtraService = require('../models/ExtraService');
const { nextInvoiceNumber } = require('./invoiceNumberService');
const { computeInvoiceBreakdown } = require('./invoiceBreakdownService');

const TYPE_LABELS = {
  reservation: 'Reserva / estancia',
  early_checkin: 'Check-in anticipado',
  late_checkout: 'Check-out tardío',
  stay_extension: 'Ampliación de estancia',
};

function typeLabel(type) {
  return TYPE_LABELS[type] || type;
}

/**
 * Emite factura fiscal y la persiste en HotelInvoice.
 * @param {object} opts
 * @param {string} opts.reservationId
 * @param {'reservation'|'early_checkin'|'late_checkout'|'stay_extension'} opts.type
 * @param {number} opts.amount — importe TTC de esta factura
 * @param {string} [opts.description]
 * @param {string} [opts.linkedReservationId]
 * @param {object} [opts.breakdownOverride]
 */
async function emitHotelInvoice(opts) {
  const {
    reservationId,
    type,
    amount,
    description,
    linkedReservationId,
    breakdownOverride,
  } = opts;

  const reservation = await Reservation.findOne({ reservation_id: reservationId });
  if (!reservation) {
    const err = new Error('Reserva no encontrada');
    err.status = 404;
    throw err;
  }
  if (reservation.cancelation_date != null && type === 'reservation') {
    const err = new Error('Reserva cancelada');
    err.status = 400;
    throw err;
  }

  const amt = roundMoney(Number(amount));
  if (!Number.isFinite(amt) || amt < 0) {
    const err = new Error('Importe no válido');
    err.status = 400;
    throw err;
  }

  if (type === 'reservation') {
    const exists = await HotelInvoice.findOne({ reservation_id: reservationId, type: 'reservation' }).lean();
    if (exists) {
      const err = new Error('Ya existe factura de reserva para esta estancia');
      err.status = 409;
      err.existing = exists;
      throw err;
    }
  }

  const clientUser = await User.findOne({ user_id: reservation.user_id }).lean();
  const room = await Room.findOne({ room_id: reservation.room_id }).lean();
  const ids = Array.isArray(room?.extra_services) ? room.extra_services.map(String).filter(Boolean) : [];
  const extraDocs = ids.length ? await ExtraService.find({ service_id: { $in: ids } }).lean() : [];

  let breakdown = breakdownOverride;
  if (!breakdown) {
    const snap = { ...reservation.toObject(), price: amt };
    breakdown =
      type === 'reservation'
        ? computeInvoiceBreakdown(snap, clientUser, room, extraDocs)
        : { concept: typeLabel(type), supplement_eur: amt, nights: 0 };
  }

  const invoiceNumber = await nextInvoiceNumber(new Date());
  const desc =
    description ||
    `${typeLabel(type)} — reserva ${reservation.reservation_id}${linkedReservationId ? ` (vinculada ${linkedReservationId})` : ''}`;

  const doc = await HotelInvoice.create({
    invoice_number: invoiceNumber,
    reservation_id: reservation.reservation_id,
    user_id: reservation.user_id,
    room_id: reservation.room_id,
    type,
    amount: amt,
    description: desc,
    issued_at: new Date(),
    invoice_breakdown: breakdown,
    linked_reservation_id: linkedReservationId || null,
  });

  reservation.invoice_number = invoiceNumber;
  reservation.invoice_breakdown = breakdown;
  if (type === 'reservation') {
    reservation.booking_paid_at = new Date();
  }
  await reservation.save();

  return { invoice: doc.toObject(), reservation };
}

async function findHotelInvoice(reservationId, invoiceNumber) {
  if (invoiceNumber) {
    return HotelInvoice.findOne({ reservation_id: reservationId, invoice_number: String(invoiceNumber).trim() }).lean();
  }
  return HotelInvoice.findOne({ reservation_id: reservationId }).sort({ issued_at: -1 }).lean();
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Importa a HotelInvoice las reservas que ya tenían invoice_number (checkout antiguo)
 * pero aún no están en la colección nueva.
 */
async function syncLegacyInvoicesFromReservations() {
  const legacy = await Reservation.find({
    invoice_number: { $type: 'string', $nin: ['', null] },
  }).lean();

  let imported = 0;
  for (const r of legacy) {
    const num = String(r.invoice_number || '').trim();
    if (!num) continue;
    const exists = await HotelInvoice.findOne({ invoice_number: num }).lean();
    if (exists) continue;

    await HotelInvoice.create({
      invoice_number: num,
      reservation_id: r.reservation_id,
      user_id: r.user_id,
      room_id: r.room_id,
      type: 'reservation',
      amount: roundMoney(Number(r.price) || 0),
      description: 'Factura importada desde reserva',
      issued_at: r.checkout_completed_at || r.booking_paid_at || new Date(),
      invoice_breakdown: r.invoice_breakdown || null,
    });
    imported += 1;
  }
  return imported;
}

/** Emite factura de reserva para estancias activas que aún no tienen ninguna. */
async function backfillActiveReservationsWithoutInvoice() {
  const active = await Reservation.find({
    cancelation_date: null,
    $or: [
      { superseded_by_reservation_id: null },
      { superseded_by_reservation_id: '' },
      { superseded_by_reservation_id: { $exists: false } },
    ],
  }).lean();

  let created = 0;
  for (const r of active) {
    const has = await HotelInvoice.findOne({
      reservation_id: r.reservation_id,
      type: 'reservation',
    }).lean();
    if (has) continue;
    if (r.invoice_number) continue;
    try {
      await emitHotelInvoice({
        reservationId: r.reservation_id,
        type: 'reservation',
        amount: Number(r.price) || 0,
      });
      created += 1;
    } catch (e) {
      if (e.status !== 409) {
        console.error('backfillActiveReservationsWithoutInvoice', r.reservation_id, e.message);
      }
    }
  }
  return created;
}

module.exports = {
  emitHotelInvoice,
  findHotelInvoice,
  syncLegacyInvoicesFromReservations,
  backfillActiveReservationsWithoutInvoice,
  typeLabel,
  TYPE_LABELS,
};
