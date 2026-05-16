const { emitHotelInvoice } = require('./invoiceEmissionService');

/**
 * Emite factura por suplemento de flexibilidad aprobada (idempotente por tipo).
 */
async function emitFlexibilityInvoiceIfNeeded(reservation, kind, block) {
  if (!block || block.status !== 'approved') return null;
  const fee = Number(block.final_fee) || 0;
  if (fee <= 0) return null;

  const type = kind === 'early' ? 'early_checkin' : 'late_checkout';
  const HotelInvoice = require('../models/HotelInvoice');
  const exists = await HotelInvoice.findOne({
    reservation_id: reservation.reservation_id,
    type,
  }).lean();
  if (exists) return exists;

  const label =
    kind === 'early'
      ? 'Check-in anticipado'
      : 'Check-out tardío';

  const { invoice } = await emitHotelInvoice({
    reservationId: reservation.reservation_id,
    type,
    amount: fee,
    description: `${label} — ${reservation.reservation_id}`,
    breakdownOverride: {
      concept: label,
      hours_difference: block.hours_difference,
      rate_per_hour: block.rate_per_hour,
      discount_percent: block.discount_percent,
      supplement_eur: fee,
    },
  });
  return invoice;
}

module.exports = { emitFlexibilityInvoiceIfNeeded };
