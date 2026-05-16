const Reservation = require('../models/Reservation');
const Room = require('../models/Room');
const Review = require('../models/Review');
const {
  nightsBetween,
  isCompletedStay,
  resolveTier,
  tierThresholds,
} = require('./clientLoyaltyStatsService');

const SEASONS = {
  12: 'invierno',
  1: 'invierno',
  2: 'invierno',
  3: 'primavera',
  4: 'primavera',
  5: 'primavera',
  6: 'verano',
  7: 'verano',
  8: 'verano',
  9: 'otoño',
  10: 'otoño',
  11: 'otoño',
};

function seasonFromDate(d) {
  const m = new Date(d).getMonth() + 1;
  return SEASONS[m] || '—';
}

function stayStatus(reservation, now = new Date()) {
  if (reservation.cancelation_date != null) return 'cancelled';
  if (isCompletedStay(reservation, now)) return 'completed';
  return 'active';
}

function parsePageLimit(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
}

async function findReviewForStay(userId, roomId, checkOut) {
  const reviews = await Review.find({ user_id: userId, room_id: roomId }).lean();
  if (!reviews.length) return null;
  const co = new Date(checkOut).getTime();
  let best = reviews[0];
  let bestDiff = Math.abs(new Date(best.createdAt).getTime() - co);
  for (const r of reviews) {
    const d = Math.abs(new Date(r.createdAt).getTime() - co);
    if (d < bestDiff) {
      best = r;
      bestDiff = d;
    }
  }
  return {
    review_id: best.review_id,
    rating: best.rating,
    comment: best.comment,
    created_at: best.createdAt,
  };
}

function buildReservationQuery(userId, query) {
  const uid = String(userId).trim();
  const q = { user_id: uid };
  const status = String(query.status || 'completed').toLowerCase();
  const now = new Date();

  if (status === 'cancelled') {
    q.cancelation_date = { $ne: null };
  } else if (status === 'active') {
    q.cancelation_date = null;
    q.check_out = { $gt: now };
  } else if (status === 'completed') {
    q.cancelation_date = null;
    q.$or = [
      { checkout_completed_at: { $ne: null } },
      { check_out: { $lte: now } },
    ];
  } else if (status !== 'all') {
    // default completed
    q.cancelation_date = null;
    q.$or = [
      { checkout_completed_at: { $ne: null } },
      { check_out: { $lte: now } },
    ];
  }

  const year = parseInt(query.year, 10);
  if (Number.isFinite(year) && year > 1900) {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    q.check_in = { $gte: from, $lt: to };
  }

  if (query.from || query.to) {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) {
      q.check_in = { ...(q.check_in || {}), $gte: from };
    }
    if (to && !Number.isNaN(to.getTime())) {
      q.check_out = { ...(q.check_out || {}), $lte: to };
    }
  }

  return { uid, q, status, roomTypeFilter: String(query.room_type || '').trim() };
}

/**
 * GET /users/:id/history — estancias paginadas con habitación y valoración.
 */
async function getUserStayHistory(userId, query = {}) {
  const { uid, q, roomTypeFilter } = buildReservationQuery(userId, query);
  const { page, limit, skip } = parsePageLimit(query);

  let reservations = await Reservation.find(q).sort({ check_in: -1 }).lean();

  if (roomTypeFilter) {
    const roomIds = await Room.find({ type: new RegExp(roomTypeFilter, 'i') }).distinct('room_id');
    const set = new Set(roomIds.map(String));
    reservations = reservations.filter((r) => set.has(String(r.room_id)));
  }

  const total = reservations.length;
  const slice = reservations.slice(skip, skip + limit);
  const roomIds = [...new Set(slice.map((r) => r.room_id))];
  const rooms = await Room.find({ room_id: { $in: roomIds } }).lean();
  const roomMap = Object.fromEntries(rooms.map((r) => [r.room_id, r]));

  const items = [];
  for (const r of slice) {
    const room = roomMap[r.room_id];
    const rating = await findReviewForStay(uid, r.room_id, r.check_out);
    items.push({
      reservation_id: r.reservation_id,
      status: stayStatus(r),
      check_in: r.check_in,
      check_out: r.check_out,
      checkout_completed_at: r.checkout_completed_at || null,
      total_paid: Number(r.price) || 0,
      nights: nightsBetween(r.check_in, r.check_out),
      room: room
        ? {
            room_id: room.room_id,
            name: room.room_id,
            type: room.type,
            description: room.description,
            image: room.image,
            images: room.images || [],
          }
        : { room_id: r.room_id, name: r.room_id, type: '—', description: '', image: null },
      rating,
    });
  }

  return {
    user_id: uid,
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
    items,
  };
}

function computeMaxStayStreak(completedStays) {
  if (!completedStays.length) return 0;
  const sorted = [...completedStays].sort(
    (a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime(),
  );
  let max = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prevOut = new Date(sorted[i - 1].check_out).getTime();
    const nextIn = new Date(sorted[i].check_in).getTime();
    const gapDays = (nextIn - prevOut) / (1000 * 60 * 60 * 24);
    if (gapDays <= 1) {
      cur += 1;
      max = Math.max(max, cur);
    } else {
      cur = 1;
    }
  }
  return max;
}

/**
 * GET /users/:id/stats — agregaciones Mongo (vía JS sobre reservas).
 */
async function getUserStayStats(userId, query = {}) {
  const { uid, q } = buildReservationQuery(userId, { ...query, status: query.status || 'all' });
  const reservations = await Reservation.find(q).lean();
  const now = new Date();

  const roomIds = [...new Set(reservations.map((r) => r.room_id))];
  const rooms = await Room.find({ room_id: { $in: roomIds } }).lean();
  const roomMap = Object.fromEntries(rooms.map((r) => [r.room_id, r]));

  let filtered = reservations;
  const roomType = String(query.room_type || '').trim();
  if (roomType) {
    filtered = filtered.filter((r) => {
      const t = roomMap[r.room_id]?.type || '';
      return t.toLowerCase().includes(roomType.toLowerCase());
    });
  }

  const seasonCounts = {};
  const roomCounts = {};
  const completedStays = [];
  let totalNights = 0;
  let totalSpent = 0;
  let cancelledCount = 0;
  let activeCount = 0;
  let lastStayCheckoutAt = null;

  for (const r of filtered) {
    if (r.cancelation_date != null) {
      cancelledCount += 1;
      continue;
    }
    const nights = nightsBetween(r.check_in, r.check_out);
    const price = Number(r.price) || 0;
    totalNights += nights;
    totalSpent += price;

    const season = seasonFromDate(r.check_in);
    seasonCounts[season] = (seasonCounts[season] || 0) + 1;
    roomCounts[r.room_id] = (roomCounts[r.room_id] || 0) + 1;

    if (isCompletedStay(r, now)) {
      completedStays.push(r);
      const endAt = r.checkout_completed_at || r.check_out;
      if (!lastStayCheckoutAt || new Date(endAt) > new Date(lastStayCheckoutAt)) {
        lastStayCheckoutAt = endAt;
      }
    } else {
      activeCount += 1;
    }
  }

  totalSpent = Math.round(totalSpent * 100) / 100;
  const loyaltyTier = resolveTier(totalNights, totalSpent);

  let favoriteSeason = null;
  let maxSeason = 0;
  for (const [s, c] of Object.entries(seasonCounts)) {
    if (c > maxSeason) {
      maxSeason = c;
      favoriteSeason = s;
    }
  }

  let mostBookedRoom = null;
  let maxRoom = 0;
  for (const [rid, c] of Object.entries(roomCounts)) {
    if (c > maxRoom) {
      maxRoom = c;
      const rm = roomMap[rid];
      mostBookedRoom = {
        room_id: rid,
        type: rm?.type || '—',
        bookings_count: c,
      };
    }
  }

  const monthCounts = {};
  for (const r of completedStays) {
    const m = new Date(r.check_in).getMonth() + 1;
    monthCounts[m] = (monthCounts[m] || 0) + 1;
  }
  let favoriteMonth = null;
  let maxM = 0;
  for (const [m, c] of Object.entries(monthCounts)) {
    if (c > maxM) {
      maxM = c;
      favoriteMonth = Number(m);
    }
  }

  return {
    user_id: uid,
    loyalty_tier: loyaltyTier,
    total_nights: totalNights,
    total_spent: totalSpent,
    completed_stays_count: completedStays.length,
    active_reservations: activeCount,
    cancelled_reservations: cancelledCount,
    last_stay_checkout_at: lastStayCheckoutAt,
    favorite_season: favoriteSeason,
    favorite_month: favoriteMonth,
    most_booked_room: mostBookedRoom,
    max_stay_streak: computeMaxStayStreak(completedStays),
    tier_thresholds: tierThresholds(),
    filters_applied: {
      year: query.year || null,
      room_type: roomType || null,
      status: query.status || 'all',
    },
  };
}

module.exports = {
  getUserStayHistory,
  getUserStayStats,
  stayStatus,
};
