const Reservation = require('../models/Reservation');
const ClientLoyaltyStats = require('../models/ClientLoyaltyStats');

function parseEnvInt(name, fallback) {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function tierThresholds() {
  return {
    silver_nights: parseEnvInt('LOYALTY_SILVER_NIGHTS', 5),
    gold_nights: parseEnvInt('LOYALTY_GOLD_NIGHTS', 15),
    silver_spent: parseEnvInt('LOYALTY_SILVER_SPENT_EUR', 400),
    gold_spent: parseEnvInt('LOYALTY_GOLD_SPENT_EUR', 1200),
  };
}

function nightsBetween(checkIn, checkOut) {
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.ceil((b - a) / (1000 * 60 * 60 * 24)));
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function isCompletedStay(reservation, now = new Date()) {
  if (reservation.cancelation_date != null) return false;
  if (reservation.checkout_completed_at) return true;
  return new Date(reservation.check_out) <= now;
}

function resolveTier(totalNights, totalSpent) {
  const t = tierThresholds();
  if (totalNights >= t.gold_nights || totalSpent >= t.gold_spent) return 'gold';
  if (totalNights >= t.silver_nights || totalSpent >= t.silver_spent) return 'silver';
  return 'bronze';
}

/**
 * Agrega todas las reservas del usuario (colección reservations) y devuelve métricas.
 */
async function computeStatsFromReservations(userId) {
  const uid = String(userId).trim();
  const reservations = await Reservation.find({ user_id: uid }).lean();
  const now = new Date();

  let totalReservations = 0;
  let cancelledCount = 0;
  let activeCount = 0;
  let completedStaysCount = 0;
  let totalNights = 0;
  let totalSpent = 0;
  let lastStayCheckoutAt = null;

  for (const r of reservations) {
    if (r.cancelation_date != null) {
      cancelledCount += 1;
      continue;
    }
    totalReservations += 1;
    const nights = nightsBetween(r.check_in, r.check_out);
    const price = Number(r.price) || 0;

    // Pago simulado al reservar: todas las reservas vigentes suman gasto y noches reservadas.
    totalNights += nights;
    totalSpent += price;

    const completed = isCompletedStay(r, now);
    if (completed) {
      completedStaysCount += 1;
      const endAt = r.checkout_completed_at || r.check_out;
      if (!lastStayCheckoutAt || new Date(endAt) > new Date(lastStayCheckoutAt)) {
        lastStayCheckoutAt = endAt;
      }
    } else {
      activeCount += 1;
    }
  }

  totalSpent = roundMoney(totalSpent);
  const loyaltyTier = resolveTier(totalNights, totalSpent);

  return {
    user_id: uid,
    loyalty_tier: loyaltyTier,
    total_nights: totalNights,
    total_spent: totalSpent,
    completed_stays_count: completedStaysCount,
    last_stay_checkout_at: lastStayCheckoutAt,
    summary: {
      total_reservations: totalReservations,
      cancelled_reservations: cancelledCount,
      active_reservations: activeCount,
      includes_active_bookings: true,
      note: 'Gasto y noches incluyen reservas activas (pago simulado en la app), no solo estancias finalizadas.',
    },
    tier_thresholds: tierThresholds(),
  };
}

/** Recalcula desde reservas y persiste/actualiza documento único por user_id. */
async function syncClientLoyaltyStats(userId) {
  const computed = await computeStatsFromReservations(userId);
  const doc = await ClientLoyaltyStats.findOneAndUpdate(
    { user_id: computed.user_id },
    {
      $set: {
        loyalty_tier: computed.loyalty_tier,
        total_nights: computed.total_nights,
        total_spent: computed.total_spent,
        completed_stays_count: computed.completed_stays_count,
        last_stay_checkout_at: computed.last_stay_checkout_at,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return {
    ...computed,
    updated_at: doc.updatedAt,
    created_at: doc.createdAt,
  };
}

async function getClientLoyaltyStats(userId, { resync = true } = {}) {
  if (resync) return syncClientLoyaltyStats(userId);
  let doc = await ClientLoyaltyStats.findOne({ user_id: String(userId).trim() }).lean();
  if (!doc) return syncClientLoyaltyStats(userId);
  const thresholds = tierThresholds();
  return {
    user_id: doc.user_id,
    loyalty_tier: doc.loyalty_tier,
    total_nights: doc.total_nights,
    total_spent: doc.total_spent,
    completed_stays_count: doc.completed_stays_count,
    last_stay_checkout_at: doc.last_stay_checkout_at,
    updated_at: doc.updatedAt,
    created_at: doc.createdAt,
    tier_thresholds: thresholds,
  };
}

/** Alias usado por controladores (flexibilidad, ampliación, checkout). */
async function syncLoyaltyForUser(userId) {
  return syncClientLoyaltyStats(userId);
}

module.exports = {
  computeStatsFromReservations,
  syncClientLoyaltyStats,
  syncLoyaltyForUser,
  getClientLoyaltyStats,
  resolveTier,
  tierThresholds,
  nightsBetween,
  isCompletedStay,
};
