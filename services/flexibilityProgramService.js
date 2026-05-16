const Reservation = require('../models/Reservation');
const ClientLoyaltyStats = require('../models/ClientLoyaltyStats');
const { getMergedFlexibilitySettings } = require('./flexibilitySettingsService');
const { getMergedOperationalSettings } = require('./operationalSettingsService');

const TIERS = ['bronze', 'silver', 'gold'];
const REQUEST_STATUSES = ['pending', 'approved', 'rejected'];

function parseEnvNumber(name, fallback) {
  const n = Number.parseFloat(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseEnvInt(name, fallback) {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function tierHasFreeAccess(tier, settings) {
  const list = settings?.free_access_tiers || [];
  return list.includes(tier);
}

async function discountPercentForTier(tier, settings) {
  const s = settings || (await getMergedFlexibilitySettings());
  switch (tier) {
    case 'gold':
      return s.discount_gold_percent;
    case 'silver':
      return s.discount_silver_percent;
    default:
      return s.discount_bronze_percent;
  }
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Horas de diferencia respecto al horario estándar (12:00 entrada / 11:00 salida). */
function computeHoursDifference(reservation, kind, requestedTime, settings) {
  const standard = kind === 'early' ? standardCheckIn(reservation) : standardCheckOut(reservation);
  const diffMs =
    kind === 'early'
      ? standard.getTime() - requestedTime.getTime()
      : requestedTime.getTime() - standard.getTime();
  let hours = diffMs / (1000 * 60 * 60);
  if (hours < 0) hours = 0;
  const minH = settings.min_billable_hours ?? 1;
  hours = Math.max(minH, Math.ceil(hours * 100) / 100);
  return hours;
}

/**
 * Suplemento = horas × €/h (settings Mongo + .env), tope opcional, descuento fidelidad.
 */
async function computeFlexibilityPricing(reservation, kind, requestedTime, tier) {
  const settings = await getMergedFlexibilitySettings();
  const hours = computeHoursDifference(reservation, kind, requestedTime, settings);
  const rate =
    kind === 'early' ? settings.early_checkin_rate_per_hour : settings.late_checkout_rate_per_hour;
  let base = roundMoney(hours * rate);
  if (settings.max_supplement_eur > 0) {
    base = Math.min(base, settings.max_supplement_eur);
  }
  const discountPercent = await discountPercentForTier(tier, settings);
  let finalFee = roundMoney(base * (1 - discountPercent / 100));
  if (tierHasFreeAccess(tier, settings)) finalFee = 0;
  return {
    loyalty_tier: tier,
    hours_difference: hours,
    rate_per_hour: rate,
    base_fee: base,
    discount_percent: discountPercent,
    final_fee: finalFee,
    free_access: tierHasFreeAccess(tier, settings),
  };
}

/** Preview sin hora concreta (usa min_billable_hours). */
async function computeFeeQuotePreview(tier, kind) {
  const settings = await getMergedFlexibilitySettings();
  const rate =
    kind === 'early' ? settings.early_checkin_rate_per_hour : settings.late_checkout_rate_per_hour;
  const hours = settings.min_billable_hours;
  let base = roundMoney(hours * rate);
  if (settings.max_supplement_eur > 0) base = Math.min(base, settings.max_supplement_eur);
  const discountPercent = await discountPercentForTier(tier, settings);
  let finalFee = roundMoney(base * (1 - discountPercent / 100));
  if (tierHasFreeAccess(tier, settings)) finalFee = 0;
  return {
    loyalty_tier: tier,
    hours_difference: hours,
    rate_per_hour: rate,
    base_fee: base,
    discount_percent: discountPercent,
    final_fee: finalFee,
    free_access: tierHasFreeAccess(tier, settings),
    note: `Estimación mínima (${hours} h × ${rate} €/h); el importe real depende de la hora solicitada`,
  };
}

/** Tier desde colección P9; si no existe documento → bronce. */
async function getLoyaltyTierForUser(userId) {
  const doc = await ClientLoyaltyStats.findOne({ user_id: String(userId).trim() }).lean();
  const tier = doc?.loyalty_tier || 'bronze';
  return TIERS.includes(tier) ? tier : 'bronze';
}

async function ensureLoyaltyStatsRow(userId) {
  const uid = String(userId).trim();
  let doc = await ClientLoyaltyStats.findOne({ user_id: uid });
  if (!doc) {
    doc = await ClientLoyaltyStats.create({ user_id: uid, loyalty_tier: 'bronze' });
  }
  return doc;
}

function parseRequestedTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Hora estándar de entrada/salida de la reserva (12:00 / 11:00). */
function standardCheckIn(reservation) {
  const d = new Date(reservation.check_in);
  d.setHours(12, 0, 0, 0);
  return d;
}

function standardCheckOut(reservation) {
  const d = new Date(reservation.check_out);
  d.setHours(11, 0, 0, 0);
  return d;
}

/** Check-in efectivo (P19 aprobado o fecha reserva). */
function getEffectiveCheckIn(reservation) {
  const block = reservation.early_checkin_requested;
  if (block?.status === 'approved' && block.requested_time) {
    return new Date(block.requested_time);
  }
  return new Date(reservation.check_in);
}

/** Check-out efectivo (P19 aprobado o fecha reserva). */
function getEffectiveCheckOut(reservation) {
  const block = reservation.late_checkout_requested;
  if (block?.status === 'approved' && block.requested_time) {
    return new Date(block.requested_time);
  }
  return new Date(reservation.check_out);
}

function sameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

async function validateEarlyRequestTime(reservation, requestedTime) {
  const settings = await getMergedFlexibilitySettings();
  const stdIn = standardCheckIn(reservation);
  const minHour = settings.early_min_hour ?? 8;
  const minTime = new Date(stdIn);
  minTime.setHours(minHour, 0, 0, 0);

  if (!sameCalendarDay(requestedTime, stdIn)) {
    return { ok: false, error: 'La entrada anticipada debe ser el mismo día que la fecha de entrada de la reserva' };
  }
  if (requestedTime >= stdIn) {
    return { ok: false, error: 'La hora solicitada debe ser anterior al check-in estándar (12:00)' };
  }
  if (requestedTime < minTime) {
    return { ok: false, error: `La hora mínima de entrada anticipada es las ${minHour}:00` };
  }
  const maxEarlyH = settings.max_early_hours;
  if (maxEarlyH > 0) {
    const diffH = (stdIn.getTime() - requestedTime.getTime()) / (1000 * 60 * 60);
    if (diffH > maxEarlyH) {
      return {
        ok: false,
        error: `Máximo ${maxEarlyH} h de adelanto respecto a las 12:00`,
      };
    }
  }
  return { ok: true };
}

/** Cliente: plazo desde salida estándar (11:00) para late / ampliación corta. */
async function validateClientFlexRequestWindow(reservation, actorRole) {
  if (actorRole === 'admin' || actorRole === 'employee') return { ok: true };
  const op = await getMergedOperationalSettings();
  const windowH = op.client_flex_request_window_hours ?? 12;
  const stdOut = standardCheckOut(reservation);
  const deadline = new Date(stdOut.getTime() + windowH * 60 * 60 * 1000);
  if (new Date() > deadline) {
    return {
      ok: false,
      error: `El plazo para solicitar salida tardía o ampliación ha expirado (máximo ${windowH} h tras las 11:00 del día de salida).`,
    };
  }
  return { ok: true };
}

async function validateLateRequestTime(reservation, requestedTime, lateMode = 'room', actorRole = 'client') {
  const windowCheck = await validateClientFlexRequestWindow(reservation, actorRole);
  if (!windowCheck.ok) return windowCheck;

  const settings = await getMergedFlexibilitySettings();
  const stdOut = standardCheckOut(reservation);
  const isFacilities = lateMode === 'facilities';
  const maxHour = isFacilities
    ? (settings.facilities_late_max_hour ?? 20)
    : (settings.late_max_hour ?? 20);
  const maxTime = new Date(stdOut);
  maxTime.setHours(maxHour, 0, 0, 0);

  if (!sameCalendarDay(requestedTime, stdOut)) {
    return {
      ok: false,
      error: isFacilities
        ? 'El uso de instalaciones debe ser el mismo día de salida de la reserva'
        : 'La salida tardía debe ser el mismo día que la fecha de salida de la reserva',
    };
  }
  if (requestedTime <= stdOut) {
    return {
      ok: false,
      error: isFacilities
        ? 'Indique hasta qué hora usará las zonas comunes (después de las 11:00)'
        : 'La hora solicitada debe ser posterior al check-out estándar (11:00)',
    };
  }
  if (requestedTime > maxTime) {
    return {
      ok: false,
      error: isFacilities
        ? `El límite en instalaciones es las ${maxHour}:00 (habitación ya liberada)`
        : `La hora máxima de salida tardía es las ${maxHour}:00`,
    };
  }
  const maxLateH = settings.max_late_hours;
  if (maxLateH > 0) {
    const diffH = (requestedTime.getTime() - stdOut.getTime()) / (1000 * 60 * 60);
    if (diffH > maxLateH) {
      return {
        ok: false,
        error: `Máximo ${maxLateH} h de retraso respecto a las 11:00`,
      };
    }
  }
  return { ok: true };
}

/**
 * Comprueba solapamiento con otras reservas de la misma habitación.
 * @param {'early'|'late'} kind
 */
async function checkRoomAvailability(reservation, requestedTime, kind, lateMode = 'room') {
  if (kind === 'late' && lateMode === 'facilities') {
    return { ok: true, reason: null };
  }
  const others = await Reservation.find({
    room_id: reservation.room_id,
    cancelation_date: null,
    reservation_id: { $ne: reservation.reservation_id },
  }).lean();

  const stdIn = standardCheckIn(reservation);
  const stdOut = standardCheckOut(reservation);

  for (const o of others) {
    const oIn = getEffectiveCheckIn(o);
    const oOut = getEffectiveCheckOut(o);
    if (kind === 'early') {
      if (oOut > requestedTime && oIn < stdIn) {
        return { ok: false, reason: 'La habitación no está libre a esa hora (reserva anterior)' };
      }
    } else if (oIn < requestedTime && oOut > stdOut) {
      return { ok: false, reason: 'La habitación tiene otra reserva que impide la salida tardía' };
    }
  }
  return { ok: true };
}

function canSubmitNewRequest(existing) {
  if (!existing) return true;
  return existing.status === 'rejected';
}

function envFlagTrue(name, defaultTrue = true) {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultTrue;
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Reglas P19: sin disponibilidad → rejected; plata/oro con hueco → approved automático; bronce → pending.
 */
function resolveApprovalDecision(tier, availabilityOk, unavailabilityReason) {
  if (!availabilityOk) {
    return {
      status: 'rejected',
      auto_approved: false,
      approval_mode: 'automatic',
      review_note: unavailabilityReason || 'Sin disponibilidad en la franja solicitada',
    };
  }

  const t = TIERS.includes(tier) ? tier : 'bronze';

  if (t === 'gold' && envFlagTrue('FLEX_AUTO_APPROVE_GOLD', true)) {
    return {
      status: 'approved',
      auto_approved: true,
      approval_mode: 'automatic',
      review_note: 'Aprobación automática (rango oro)',
    };
  }

  if (t === 'silver' && envFlagTrue('FLEX_AUTO_APPROVE_SILVER', true)) {
    return {
      status: 'approved',
      auto_approved: true,
      approval_mode: 'automatic',
      review_note: 'Aprobación automática (rango plata)',
    };
  }

  return {
    status: 'pending',
    auto_approved: false,
    approval_mode: 'manual',
    review_note: 'Pendiente de revisión en recepción (rango bronce)',
  };
}

function buildRequestPayload({ quote, requestedTime, availabilityOk, approval, lateMode = 'room' }) {
  const decision = approval || resolveApprovalDecision(quote.loyalty_tier, availabilityOk, null);
  return {
    requested_at: new Date(),
    requested_time: requestedTime,
    late_mode: lateMode === 'facilities' ? 'facilities' : 'room',
    status: decision.status,
    loyalty_tier: quote.loyalty_tier,
    hours_difference: quote.hours_difference,
    rate_per_hour: quote.rate_per_hour,
    base_fee: quote.base_fee,
    discount_percent: quote.discount_percent,
    final_fee: quote.final_fee,
    availability_ok: availabilityOk,
    auto_approved: decision.auto_approved,
    approval_mode: decision.approval_mode,
    reviewed_at: decision.status !== 'pending' ? new Date() : null,
    reviewed_by: decision.status !== 'pending' ? 'system:auto' : null,
    review_note: decision.review_note,
    client_notified_at: null,
  };
}

/** Aplica tarifa y nueva hora cuando status === approved. */
function applyApprovedFlexibilityToReservation(reservation, kind, block) {
  if (!block || block.status !== 'approved') return;
  const fee = Number(block.final_fee) || 0;
  reservation.price = roundMoney(Number(reservation.price) + fee);
  if (kind === 'early') {
    reservation.check_in = new Date(block.requested_time);
  } else if (block.late_mode !== 'facilities') {
    reservation.check_out = new Date(block.requested_time);
  }
}

module.exports = {
  TIERS,
  REQUEST_STATUSES,
  getLoyaltyTierForUser,
  ensureLoyaltyStatsRow,
  computeFlexibilityPricing,
  computeFeeQuotePreview,
  parseRequestedTime,
  validateEarlyRequestTime,
  validateLateRequestTime,
  validateClientFlexRequestWindow,
  checkRoomAvailability,
  canSubmitNewRequest,
  buildRequestPayload,
  resolveApprovalDecision,
  applyApprovedFlexibilityToReservation,
  envFlagTrue,
  standardCheckIn,
  standardCheckOut,
  getEffectiveCheckIn,
  getEffectiveCheckOut,
};
