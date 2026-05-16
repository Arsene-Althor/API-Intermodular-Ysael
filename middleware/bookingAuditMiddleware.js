// Leer estado actual en Mongo antes de cancelar (POST/DELETE) o actualizar (PATCH).
const Reservation = require('../models/Reservation');
const { cloneState } = require('../services/auditService');

// POST /cancel, DELETE /cancel/:id y PATCH /update: copia en Mongo antes del cambio (req.bookingAuditPreviousState).
async function capturePreviousReservationState(req, res, next) {
  try {
    const reservation_id =
      (req.body && req.body.reservation_id) ||
      (req.params && (req.params.reservation_id || req.params.id));
    if (!reservation_id) {
      req.bookingAuditPreviousState = undefined;
      return next();
    }

    const doc = await Reservation.findOne({ reservation_id });
    req.bookingAuditPreviousState = doc ? cloneState(doc) : null;
    next();
  } catch (err) {
    return res.status(500).json({
      error: 'Error al preparar auditoría',
      detalle: err.message,
    });
  }
}

// POST /add: no hay reserva previa (solo creación).
function capturePreviousForNewReservation(req, res, next) {
  req.bookingAuditPreviousState = null;
  next();
}

module.exports = {
  capturePreviousReservationState,
  capturePreviousForNewReservation,
};
