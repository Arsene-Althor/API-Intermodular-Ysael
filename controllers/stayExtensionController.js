const Reservation = require('../models/Reservation');
const { extendStayForReservation } = require('../services/stayExtensionService');
const { syncLoyaltyForUser } = require('../services/clientLoyaltyStatsService');

function puedeVerReserva(req, reservaDoc) {
  if (!reservaDoc) return false;
  if (req.user.role === 'admin' || req.user.role === 'employee') return true;
  return reservaDoc.user_id === req.user.user_id;
}

function resolveBookingId(req) {
  return String(req.params.id || req.params.reservation_id || '').trim();
}

/**
 * PATCH /bookings/:id/extend-stay
 * Body: { "new_check_out": "2026-06-10" } (ISO o YYYY-MM-DD)
 */
async function extendStay(req, res) {
  try {
    const reservation_id = resolveBookingId(req);
    const { new_check_out } = req.body;
    if (!new_check_out) {
      return res.status(400).json({ error: 'Falta new_check_out en el body' });
    }

    const reservation = await Reservation.findOne({ reservation_id });
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const result = await extendStayForReservation({
      reservation,
      newCheckOut: new_check_out,
      actorId: req.user.user_id,
      actorRole: req.user.role,
    });

    try {
      await syncLoyaltyForUser(reservation.user_id);
    } catch (loyaltyErr) {
      console.error('syncLoyaltyForUser', reservation.user_id, loyaltyErr.message);
    }

    if (result.already_applied) {
      return res.json({
        mensaje: 'La estancia ya estaba ampliada hasta esa fecha',
        ...result,
      });
    }

    let mensaje;
    if (result.room_changed) {
      mensaje = `Salida ampliada. Nueva reserva ${result.reservation_id} en habitación ${result.room_id} (la anterior quedó cerrada).`;
    } else if (result.extension_mode === 'hours') {
      mensaje = `Salida ampliada ${result.extra_hours} h en la misma habitación. Factura emitida.`;
    } else {
      mensaje = `Estancia ampliada ${result.extra_nights} noche(s). Factura emitida.`;
    }

    return res.json({
      mensaje,
      ...result,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, existing: err.existing });
    }
    console.error('extendStay', err);
    return res.status(500).json({ error: 'Error al ampliar estancia', detalle: err.message });
  }
}

module.exports = { extendStay };
