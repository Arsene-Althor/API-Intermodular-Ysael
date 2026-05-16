const Reservation = require('../models/Reservation');
const Room = require('../models/Room');
const HotelInvoice = require('../models/HotelInvoice');
const { emitHotelInvoice } = require('./invoiceEmissionService');
const { logBookingChange } = require('./auditService');
const { getMergedFlexibilitySettings } = require('./flexibilitySettingsService');
const {
  standardCheckOut,
  validateClientFlexRequestWindow,
} = require('./flexibilityProgramService');

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Fecha `YYYY-MM-DD` → salida 11:00. ISO con hora → se respeta la hora. */
function parseNewCheckOut(input) {
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 11, 0, 0, 0);
  }
  const x = new Date(s);
  if (Number.isNaN(x.getTime())) {
    const err = new Error('Fecha u hora de salida no válida');
    err.status = 400;
    throw err;
  }
  return x;
}

async function roomHasConflict(roomId, checkIn, checkOut, excludeReservationId) {
  const q = {
    cancelation_date: null,
    room_id: roomId,
    check_in: { $lt: checkOut },
    check_out: { $gt: checkIn },
  };
  if (excludeReservationId) q.reservation_id = { $ne: excludeReservationId };
  const hit = await Reservation.findOne(q).select('reservation_id').lean();
  return Boolean(hit);
}

async function findAlternativeRoom(checkIn, checkOut, guests, excludeReservationId, preferType) {
  const overlapping = await Reservation.find({
    cancelation_date: null,
    check_in: { $lt: checkOut },
    check_out: { $gt: checkIn },
    reservation_id: { $ne: excludeReservationId },
  })
    .select('room_id')
    .lean();
  const occupied = new Set(overlapping.map((r) => String(r.room_id).trim()));
  const filter = {
    isOperational: { $ne: false },
    max_occupancy: { $gte: Math.max(1, guests) },
    room_id: { $nin: [...occupied] },
  };
  if (preferType) filter.type = preferType;
  const rooms = await Room.find(filter).sort({ room_id: 1 }).lean();
  return rooms[0] || null;
}

async function computeExtensionSupplement(room, oldCheckOut, newCheckOut) {
  const diffMs = newCheckOut.getTime() - oldCheckOut.getTime();
  if (diffMs <= 0) return { extraNights: 0, extraHours: 0, supplement: 0, mode: 'none' };

  const dayMs = 1000 * 60 * 60 * 24;
  const settings = await getMergedFlexibilitySettings();
  const hourlyRate = Number(settings.late_checkout_rate_per_hour) || 12;

  if (diffMs < dayMs) {
    const extraHours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
    return {
      extraNights: 0,
      extraHours,
      supplement: roundMoney(extraHours * hourlyRate),
      mode: 'hours',
    };
  }

  const extraNights = Math.ceil(diffMs / dayMs);
  let nightly = Number(room.price_per_night) || 0;
  if (room.offer_active && room.offer_percent > 0 && room.offer_percent <= 100) {
    nightly = roundMoney(nightly * (1 - room.offer_percent / 100));
  }
  return {
    extraNights,
    extraHours: 0,
    supplement: roundMoney(nightly * extraNights),
    mode: 'nights',
  };
}

async function nextReservationId() {
  const idRegex = /^RSV-(\d{5})$/;
  const todas = await Reservation.find({ reservation_id: { $regex: /^RSV-\d{5}$/ } })
    .select('reservation_id')
    .lean();
  let maxNum = 0;
  for (const d of todas) {
    const m = idRegex.exec(String(d.reservation_id || ''));
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  return `RSV-${String(maxNum + 1).padStart(5, '0')}`;
}

/**
 * Amplía check_out. Si la habitación actual no está libre en el tramo extra, crea nueva reserva en otra habitación.
 */
async function extendStayForReservation({ reservation, newCheckOut, actorId, actorRole }) {
  if (reservation.cancelation_date && !reservation.superseded_by_reservation_id) {
    const err = new Error('Reserva cancelada');
    err.status = 400;
    throw err;
  }
  if (reservation.superseded_by_reservation_id) {
    const err = new Error(
      `Esta reserva fue sustituida por ${reservation.superseded_by_reservation_id}. Use la reserva activa.`,
    );
    err.status = 400;
    throw err;
  }

  const oldCheckOut = new Date(reservation.check_out);
  const newOut = parseNewCheckOut(newCheckOut);

  if (actorRole === 'client' && newOut.getTime() > oldCheckOut.getTime()) {
    const dayMs = 1000 * 60 * 60 * 24;
    const diffMs = newOut.getTime() - oldCheckOut.getTime();
    const stdOut = standardCheckOut(reservation);
    const pastStd = Date.now() >= stdOut.getTime();
    if (diffMs < dayMs || pastStd) {
      const windowCheck = await validateClientFlexRequestWindow(reservation, actorRole);
      if (!windowCheck.ok) {
        const err = new Error(windowCheck.error);
        err.status = 400;
        throw err;
      }
    }
  }

  if (newOut.getTime() <= oldCheckOut.getTime()) {
    const existingExt = await HotelInvoice.findOne({
      reservation_id: reservation.reservation_id,
      type: 'stay_extension',
    })
      .sort({ issued_at: -1 })
      .lean();
    if (existingExt && Math.abs(newOut.getTime() - oldCheckOut.getTime()) < 120000) {
      return {
        reservation_id: reservation.reservation_id,
        previous_reservation_id: null,
        room_id: reservation.room_id,
        room_changed: false,
        check_out: reservation.check_out,
        price: reservation.price,
        supplement: existingExt.amount,
        extra_nights: 0,
        extra_hours: 0,
        extension_mode: 'none',
        invoice: existingExt,
        already_applied: true,
      };
    }
    const err = new Error(
      newOut.getTime() === oldCheckOut.getTime()
        ? 'No puede ser la misma fecha de salida que la de su estancia actual'
        : 'La nueva salida debe ser posterior a la actual',
    );
    err.status = 400;
    throw err;
  }

  const room = await Room.findOne({ room_id: reservation.room_id }).lean();
  if (!room) {
    const err = new Error('Habitación no encontrada');
    err.status = 404;
    throw err;
  }

  const pricing = await computeExtensionSupplement(room, oldCheckOut, newOut);
  const { extraNights, extraHours, supplement, mode } = pricing;
  if (supplement <= 0) {
    const err = new Error('El tiempo de ampliación debe ser mayor que la salida actual');
    err.status = 400;
    throw err;
  }

  const sameRoomOk = !(await roomHasConflict(
    reservation.room_id,
    oldCheckOut,
    newOut,
    reservation.reservation_id,
  ));

  let targetReservation = reservation;
  let roomChanged = false;
  let previousReservationId = null;

  if (!sameRoomOk) {
    const alt = await findAlternativeRoom(
      reservation.check_in,
      newOut,
      room.max_occupancy || 2,
      reservation.reservation_id,
      room.type,
    );
    if (!alt) {
      const err = new Error('No hay habitación disponible para ampliar la estancia en esas fechas');
      err.status = 409;
      throw err;
    }

    const newId = await nextReservationId();
    const newPrice = roundMoney(Number(reservation.price) + supplement);
    const newDoc = await Reservation.create({
      reservation_id: newId,
      room_id: alt.room_id,
      user_id: reservation.user_id,
      check_in: reservation.check_in,
      check_out: newOut,
      price: newPrice,
      createdBy: actorId || reservation.user_id,
      extended_from_reservation_id: reservation.reservation_id,
      booking_paid_at: reservation.booking_paid_at || null,
    });

    reservation.superseded_by_reservation_id = newId;
    await reservation.save();

    targetReservation = newDoc;
    roomChanged = true;
    previousReservationId = reservation.reservation_id;

    const extLabel =
      mode === 'hours'
        ? `Ampliación salida (+${extraHours} h)`
        : `Ampliación estancia (+${extraNights} noche(s))`;

    try {
      const { invoice } = await emitHotelInvoice({
        reservationId: targetReservation.reservation_id,
        type: 'stay_extension',
        amount: supplement,
        description: `${extLabel} — habitación ${targetReservation.room_id}`,
        linkedReservationId: previousReservationId,
        breakdownOverride: {
          concept: mode === 'hours' ? 'Salida tardía (ampliación)' : 'Ampliación de estancia',
          extra_nights: extraNights,
          extra_hours: extraHours,
          supplement_eur: supplement,
          room_changed: true,
          previous_reservation_id: previousReservationId,
        },
      });

      await logBookingChange({
        booking_id: targetReservation.reservation_id,
        action: 'CREATED',
        actor_id: actorId,
        actor_type: actorRole === 'client' ? 'client' : 'staff',
        previous_state: null,
        new_state: targetReservation,
      });

      return {
        reservation_id: targetReservation.reservation_id,
        previous_reservation_id: previousReservationId,
        room_id: targetReservation.room_id,
        room_changed: roomChanged,
        check_out: targetReservation.check_out,
        price: targetReservation.price,
        supplement,
        extra_nights: extraNights,
        extra_hours: extraHours,
        extension_mode: mode,
        invoice,
      };
    } catch (invoiceErr) {
      await Reservation.deleteOne({ reservation_id: newId });
      reservation.superseded_by_reservation_id = null;
      await reservation.save();
      throw invoiceErr;
    }
  }

  const prevCheckOut = reservation.check_out;
  const prevPrice = reservation.price;
  reservation.check_out = newOut;
  reservation.price = roundMoney(Number(reservation.price) + supplement);
  targetReservation = reservation;

  const extLabel =
    mode === 'hours'
      ? `Ampliación salida (+${extraHours} h)`
      : `Ampliación estancia (+${extraNights} noche(s))`;

  let invoice;
  try {
    await reservation.save();
    ({ invoice } = await emitHotelInvoice({
      reservationId: targetReservation.reservation_id,
      type: 'stay_extension',
      amount: supplement,
      description: extLabel,
      linkedReservationId: null,
      breakdownOverride: {
        concept: mode === 'hours' ? 'Salida tardía (ampliación)' : 'Ampliación de estancia',
        extra_nights: extraNights,
        extra_hours: extraHours,
        supplement_eur: supplement,
        room_changed: false,
        previous_reservation_id: null,
      },
    }));
  } catch (invoiceErr) {
    reservation.check_out = prevCheckOut;
    reservation.price = prevPrice;
    await reservation.save();
    throw invoiceErr;
  }

  await logBookingChange({
    booking_id: targetReservation.reservation_id,
    action: roomChanged ? 'CREATED' : 'UPDATED',
    actor_id: actorId,
    actor_type: actorRole === 'client' ? 'client' : 'staff',
    previous_state: roomChanged ? null : reservation,
    new_state: targetReservation,
  });

  return {
    reservation_id: targetReservation.reservation_id,
    previous_reservation_id: previousReservationId,
    room_id: targetReservation.room_id,
    room_changed: roomChanged,
    check_out: targetReservation.check_out,
    price: targetReservation.price,
    supplement,
    extra_nights: extraNights,
    extra_hours: extraHours,
    extension_mode: mode,
    invoice,
  };
}

module.exports = {
  extendStayForReservation,
  computeExtensionSupplement,
  roomHasConflict,
};
