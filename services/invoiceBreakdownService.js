const ExtraService = require('../models/ExtraService');

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Desglose de factura alineado con calculatePrice (alojamiento + dto cliente) + extras por precio en catálogo.
 * `adjustment_amount` cuadra con reservation.price (importe pactado TTC).
 */
function computeInvoiceBreakdown(reservation, user, room, extraDocs) {
  const ms = new Date(reservation.check_out) - new Date(reservation.check_in);
  const nights = Math.max(1, Math.ceil(ms / 86400000));

  const base = Number(room?.price_per_night) || 0;
  let offer_active = !!(room?.offer_active);
  let offer_percent = offer_active ? Number(room.offer_percent) || 0 : 0;
  if (offer_percent < 0) offer_percent = 0;
  if (offer_percent > 100) offer_percent = 100;

  let nightly = base;
  if (room?.offer_active && offer_percent > 0 && offer_percent <= 100) {
    nightly = round2(base * (1 - offer_percent / 100));
  } else {
    offer_active = false;
    offer_percent = 0;
  }

  const subtotal_hospitality = round2(nights * nightly);
  const discountRate = Math.min(0.99, Math.max(0, Number(user?.discount) || 0));
  const client_discount_amount = round2(subtotal_hospitality * discountRate);
  const after_client_discount = round2(subtotal_hospitality - client_discount_amount);

  const extras_lines = [];
  let extras_subtotal = 0;
  const ids = Array.isArray(room?.extra_services) ? room.extra_services.map(String) : [];
  for (const id of ids) {
    const doc = (extraDocs || []).find((e) => e.service_id === id);
    const name = doc?.name || id;
    const amount = round2(Number(doc?.price) || 0);
    extras_lines.push({ service_id: id, name, amount });
    extras_subtotal += amount;
  }
  extras_subtotal = round2(extras_subtotal);

  const computed_total = round2(after_client_discount + extras_subtotal);
  const price = round2(Number(reservation.price) || 0);
  const adjustment_amount = round2(price - computed_total);

  return {
    computed_at: new Date().toISOString(),
    currency: 'EUR',
    nights,
    price_per_night_list: base,
    room_offer_active: offer_active,
    room_offer_percent: offer_percent,
    nightly_effective: nightly,
    subtotal_hospitality,
    client_discount_rate: discountRate,
    client_discount_amount,
    subtotal_after_client_discount: after_client_discount,
    extras_lines,
    extras_subtotal,
    adjustment_amount,
    total_reservation: price,
  };
}

async function loadExtraDocsForRoom(room) {
  const ids = Array.isArray(room?.extra_services) ? room.extra_services.map(String).filter(Boolean) : [];
  if (!ids.length) return [];
  return ExtraService.find({ service_id: { $in: ids } }).lean();
}

module.exports = {
  computeInvoiceBreakdown,
  loadExtraDocsForRoom,
  round2,
};
