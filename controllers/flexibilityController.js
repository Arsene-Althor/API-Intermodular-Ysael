const Reservation = require('../models/Reservation');
const HotelInvoice = require('../models/HotelInvoice');
const { logBookingChange, actorTypeFromRole } = require('../services/auditService');
const {
  getLoyaltyTierForUser,
  ensureLoyaltyStatsRow,
  computeFlexibilityPricing,
  computeFeeQuotePreview,
  parseRequestedTime,
  validateEarlyRequestTime,
  validateLateRequestTime,
  checkRoomAvailability,
  canSubmitNewRequest,
  buildRequestPayload,
  resolveApprovalDecision,
  applyApprovedFlexibilityToReservation,
  standardCheckIn,
  standardCheckOut,
} = require('../services/flexibilityProgramService');
const { getMergedFlexibilitySettings } = require('../services/flexibilitySettingsService');
const { notifyFlexibilityDecision } = require('../services/flexibilityNotificationService');
const { emitFlexibilityInvoiceIfNeeded } = require('../services/flexibilityInvoiceHelper');

function resolveBookingId(req) {
  return req.params.id || req.params.reservation_id;
}

function puedeVerReserva(req, reservaDoc) {
  if (!reservaDoc) return false;
  if (req.user.role === 'admin' || req.user.role === 'employee') return true;
  return reservaDoc.user_id === req.user.user_id;
}

function isStaff(req) {
  return req.user.role === 'admin' || req.user.role === 'employee';
}

function serializeFlexBlock(block) {
  if (!block) return null;
  return typeof block.toObject === 'function' ? block.toObject() : block;
}

function flexFieldForKind(kind) {
  return kind === 'early' ? 'early_checkin_requested' : 'late_checkout_requested';
}

/**
 * Flujo unificado P19: disponibilidad → fidelidad → aprobación auto/manual.
 */
async function submitFlexibilityRequest(req, res, kind) {
  const reservation_id = resolveBookingId(req);
  const { requested_time, mode } = req.body;
  const lateMode = kind === 'late' && String(mode || 'room').toLowerCase() === 'facilities' ? 'facilities' : 'room';
  const requestedTime = parseRequestedTime(requested_time);
  if (!requestedTime) {
    return res.status(400).json({ error: 'requested_time no válido (use ISO 8601)' });
  }

  const reservation = await Reservation.findOne({ reservation_id });
  if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
  if (!puedeVerReserva(req, reservation)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  if (req.user.role === 'client' && reservation.user_id !== req.user.user_id) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  if (reservation.cancelation_date != null) {
    return res.status(400).json({ error: 'Reserva cancelada' });
  }

  const field = flexFieldForKind(kind);
  if (!canSubmitNewRequest(reservation[field])) {
    return res.status(400).json({
      error: `Ya existe una solicitud de ${kind === 'early' ? 'entrada anticipada' : 'salida tardía'} activa o aprobada`,
      current: serializeFlexBlock(reservation[field]),
    });
  }

  const timeCheck =
    kind === 'early'
      ? await validateEarlyRequestTime(reservation, requestedTime)
      : await validateLateRequestTime(reservation, requestedTime, lateMode, req.user.role);
  if (!timeCheck.ok) return res.status(400).json({ error: timeCheck.error });

  await ensureLoyaltyStatsRow(reservation.user_id);
  const avail = await checkRoomAvailability(reservation, requestedTime, kind, lateMode);
  const tier = await getLoyaltyTierForUser(reservation.user_id);
  const quote = await computeFlexibilityPricing(reservation, kind, requestedTime, tier);
  let approval = resolveApprovalDecision(tier, avail.ok, avail.reason);

  // Huésped (app): siempre pending si hay hueco → recepción aprueba/rechaza en WPF.
  // Auto-aprobación solo al solicitar como empleado/admin (mostrador).
  const isClient = req.user.role === 'client';
  if (isClient && avail.ok) {
    approval = {
      status: 'pending',
      auto_approved: false,
      approval_mode: 'manual',
      review_note: `Pendiente de revisión en recepción (rango ${tier})`,
    };
  }

  const block = buildRequestPayload({
    quote,
    requestedTime,
    availabilityOk: avail.ok,
    approval,
    lateMode,
  });

  if (block.status === 'approved') {
    applyApprovedFlexibilityToReservation(reservation, kind, block);
  }

  reservation[field] = block;
  reservation.markModified(field);
  await reservation.save();

  if (block.status === 'approved') {
    await emitFlexibilityInvoiceIfNeeded(reservation, kind, block);
  }

  let notification = null;
  if (block.status === 'approved' || block.status === 'rejected') {
    notification = await notifyFlexibilityDecision({ reservation, kind, block });
    if (notification.sent) {
      reservation[field].client_notified_at = new Date();
      reservation.markModified(field);
      await reservation.save();
    }
  }

  const { syncLoyaltyForUser } = require('../services/clientLoyaltyStatsService');
  try {
    await syncLoyaltyForUser(reservation.user_id);
  } catch (loyaltyErr) {
    console.error('syncLoyaltyForUser', reservation.user_id, loyaltyErr.message);
  }

  await logBookingChange({
    booking_id: reservation.reservation_id,
    action: 'UPDATED',
    actor_id: req.user.user_id,
    actor_type: actorTypeFromRole(req.user.role),
    previous_state: req.bookingAuditPreviousState,
    new_state: reservation,
  });

  const typeLabel =
    kind === 'early'
      ? 'entrada anticipada'
      : lateMode === 'facilities'
        ? 'salida tardía (instalaciones)'
        : 'salida tardía';
  let mensaje;
  if (block.status === 'approved') {
    mensaje = isClient
      ? `Solicitud de ${typeLabel} aprobada`
      : `Solicitud de ${typeLabel} aprobada automáticamente (rango ${tier})`;
  } else if (block.status === 'rejected') {
    mensaje = `Solicitud de ${typeLabel} rechazada: sin disponibilidad en la franja horaria`;
  } else {
    mensaje = `Solicitud de ${typeLabel} registrada; pendiente de revisión en recepción (rango ${tier})`;
  }

  return res.json({
    mensaje,
    reservation_id: reservation.reservation_id,
    loyalty_tier: tier,
    availability_ok: avail.ok,
    auto_approved: block.auto_approved,
    approval_mode: block.approval_mode,
    [field]: block,
    price: reservation.price,
    pricing: {
      hours_difference: quote.hours_difference,
      rate_per_hour: quote.rate_per_hour,
      base_fee: quote.base_fee,
      final_fee: quote.final_fee,
    },
    notification,
  });
}

async function getFlexibilityStatus(req, res) {
  try {
    const reservation_id = resolveBookingId(req);
    const reservation = await Reservation.findOne({ reservation_id }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const tier = await getLoyaltyTierForUser(reservation.user_id);
    const pricingConfig = await getMergedFlexibilitySettings();
    const earlyQuote = await computeFeeQuotePreview(tier, 'early');
    const lateQuote = await computeFeeQuotePreview(tier, 'late');

    return res.json({
      reservation_id,
      price: reservation.price,
      loyalty_tier: tier,
      pricing_config: pricingConfig,
      pricing_formula: 'suplemento = horas_diferencia × €/h (mín. min_billable_hours); descuento por rango fidelidad',
      auto_approval_rules: {
        cliente_app: 'pending si hay disponibilidad (recepción aprueba o rechaza)',
        empleado_mostrador: 'plata/oro pueden aprobarse al registrar la solicitud',
        bronze: 'pending (revisión manual) si hay disponibilidad',
        sin_disponibilidad: 'rejected automático para todos (sin hueco en habitación)',
      },
      standard_check_in: standardCheckIn(reservation),
      standard_check_out: standardCheckOut(reservation),
      early_checkin_requested: reservation.early_checkin_requested || null,
      late_checkout_requested: reservation.late_checkout_requested || null,
      fee_preview: {
        early_checkin: earlyQuote,
        late_checkout: lateQuote,
      },
    });
  } catch (err) {
    console.error('getFlexibilityStatus', err);
    return res.status(500).json({ error: 'Error al consultar flexibilidad', detalle: err.message });
  }
}

/** PATCH /bookings/:id/request-early-checkin */
async function requestEarlyCheckinBooking(req, res) {
  try {
    return await submitFlexibilityRequest(req, res, 'early');
  } catch (err) {
    console.error('requestEarlyCheckinBooking', err);
    return res.status(500).json({ error: 'Error al solicitar entrada anticipada', detalle: err.message });
  }
}

/** PATCH /bookings/:id/request-late-checkout */
async function requestLateCheckoutBooking(req, res) {
  try {
    return await submitFlexibilityRequest(req, res, 'late');
  } catch (err) {
    console.error('requestLateCheckoutBooking', err);
    return res.status(500).json({ error: 'Error al solicitar salida tardía', detalle: err.message });
  }
}

/** Compat: POST /reservation/:id/flexibility/early-checkin */
async function requestEarlyCheckin(req, res) {
  return requestEarlyCheckinBooking(req, res);
}

/** Compat: POST /reservation/:id/flexibility/late-checkout */
async function requestLateCheckout(req, res) {
  return requestLateCheckoutBooking(req, res);
}

async function reviewFlexibilityRequest(req, res, kind) {
  try {
    if (!isStaff(req)) {
      return res.status(403).json({ error: 'Solo personal del hotel puede aprobar o rechazar' });
    }

    const reservation_id = resolveBookingId(req);
    const { decision, review_note } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision debe ser approved o rejected' });
    }

    const reservation = await Reservation.findOne({ reservation_id });
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });

    const field = flexFieldForKind(kind);
    const block = reservation[field];
    if (!block || block.status !== 'pending') {
      return res.status(400).json({ error: 'No hay solicitud pendiente para revisar' });
    }

    if (decision === 'approved') {
      const avail = await checkRoomAvailability(
        reservation,
        new Date(block.requested_time),
        kind,
      );
      if (!avail.ok) {
        return res.status(400).json({
          error: avail.reason || 'Sin disponibilidad en la franja; rechace la solicitud',
        });
      }
      block.availability_ok = true;
    }

    block.status = decision;
    block.auto_approved = false;
    block.approval_mode = 'manual';
    block.reviewed_at = new Date();
    block.reviewed_by = req.user.user_id;
    if (review_note != null && String(review_note).trim()) {
      block.review_note = String(review_note).trim();
    }

    if (decision === 'approved') {
      applyApprovedFlexibilityToReservation(reservation, kind, block);
    }

    reservation.markModified(field);
    await reservation.save();

    if (decision === 'approved') {
      await emitFlexibilityInvoiceIfNeeded(reservation, kind, block);
    }

    const notification = await notifyFlexibilityDecision({ reservation, kind, block });
    if (notification.sent) {
      reservation[field].client_notified_at = new Date();
      reservation.markModified(field);
      await reservation.save();
    }

    await logBookingChange({
      booking_id: reservation.reservation_id,
      action: 'UPDATED',
      actor_id: req.user.user_id,
      actor_type: actorTypeFromRole(req.user.role),
      previous_state: req.bookingAuditPreviousState,
      new_state: reservation,
    });

    return res.json({
      mensaje: decision === 'approved' ? 'Solicitud aprobada' : 'Solicitud rechazada',
      reservation_id,
      [field]: reservation[field],
      price: reservation.price,
      notification,
    });
  } catch (err) {
    console.error('reviewFlexibilityRequest', err);
    return res.status(500).json({ error: 'Error al revisar solicitud', detalle: err.message });
  }
}

function reviewEarlyCheckin(req, res) {
  return reviewFlexibilityRequest(req, res, 'early');
}

function reviewLateCheckout(req, res) {
  return reviewFlexibilityRequest(req, res, 'late');
}

function parseDayFilter(req) {
  const raw = req.query?.day || req.query?.date;
  const base = raw ? new Date(String(raw)) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function isStayDayInRange(dateVal, range) {
  const d = new Date(dateVal);
  return d >= range.start && d < range.end;
}

function isRequestedToday(requestedAt, dayRange) {
  if (!requestedAt) return false;
  const at = new Date(requestedAt);
  if (Number.isNaN(at.getTime())) return false;
  if (!dayRange) return true;
  return at >= dayRange.start && at < dayRange.end;
}

function pushFlexItem(items, seen, row) {
  const key = `${row.reservation_id}:${row.type}:${row.request?.status || row.status_summary || ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  items.push(row);
}

async function listPendingFlexibility(req, res) {
  try {
    if (!isStaff(req)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const dayRange = parseDayFilter(req);
    const items = [];
    const seen = new Set();

    const reservations = await Reservation.find({
      cancelation_date: null,
      $or: [
        { 'early_checkin_requested.status': { $in: ['pending', 'approved', 'rejected'] } },
        { 'late_checkout_requested.status': { $in: ['pending', 'approved', 'rejected'] } },
      ],
    })
      .select(
        'reservation_id room_id user_id check_in check_out price early_checkin_requested late_checkout_requested',
      )
      .lean();

    for (const r of reservations) {
      const blocks = [
        { type: 'early_checkin', request: r.early_checkin_requested, stayDay: r.check_in },
        { type: 'late_checkout', request: r.late_checkout_requested, stayDay: r.check_out },
      ];
      for (const { type, request, stayDay } of blocks) {
        if (!request?.status) continue;
        const todayRequest = isRequestedToday(request.requested_at, dayRange);
        const stayOnDay = dayRange ? isStayDayInRange(stayDay, dayRange) : true;
        if (!todayRequest && !stayOnDay) continue;
        if (request.status !== 'pending' && !todayRequest) continue;

        const needsReview = request.status === 'pending';
        pushFlexItem(items, seen, {
          reservation_id: r.reservation_id,
          room_id: r.room_id,
          user_id: r.user_id,
          check_in: r.check_in,
          check_out: r.check_out,
          price: r.price,
          type,
          request,
          needs_review: needsReview,
          status_summary: request.status,
        });
      }
    }

    const extQuery = { type: 'stay_extension' };
    if (dayRange) {
      extQuery.issued_at = { $gte: dayRange.start, $lt: dayRange.end };
    }
    const extensions = await HotelInvoice.find(extQuery)
      .sort({ issued_at: -1 })
      .limit(80)
      .lean();

    for (const inv of extensions) {
      const r = await Reservation.findOne({ reservation_id: inv.reservation_id })
        .select('reservation_id room_id user_id check_in check_out price')
        .lean();
      if (!r) continue;
      pushFlexItem(items, seen, {
        reservation_id: r.reservation_id,
        room_id: r.room_id,
        user_id: r.user_id,
        check_in: r.check_in,
        check_out: r.check_out,
        price: r.price,
        type: 'stay_extension',
        request: null,
        needs_review: false,
        status_summary: 'processed',
        supplement: inv.amount,
        description: inv.description,
        issued_at: inv.issued_at,
      });
    }

    const pendingCount = items.filter((i) => i.needs_review).length;

    return res.json({
      count: items.length,
      pending_count: pendingCount,
      day: dayRange ? dayRange.start.toISOString().slice(0, 10) : null,
      items,
    });
  } catch (err) {
    console.error('listPendingFlexibility', err);
    return res.status(500).json({ error: 'Error al listar pendientes', detalle: err.message });
  }
}

module.exports = {
  getFlexibilityStatus,
  requestEarlyCheckinBooking,
  requestLateCheckoutBooking,
  requestEarlyCheckin,
  requestLateCheckout,
  reviewEarlyCheckin,
  reviewLateCheckout,
  listPendingFlexibility,
};
