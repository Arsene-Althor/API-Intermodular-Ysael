// controllers/auditController.js — historial de auditoría de reservas (solo lectura)
const Reservation = require('../models/Reservation');
const BookingAuditLog = require('../models/BookingAuditLog');
const { describeReservationAuditChanges } = require('../services/auditService');

// Misma regla que en reservationController: cliente dueño o personal
function puedeVerReserva(req, reservaDoc) {
  if (!reservaDoc) return false;
  if (req.user.role === 'admin' || req.user.role === 'employee') return true;
  return reservaDoc.user_id === req.user.user_id;
}

async function getBookingAudit(req, res) {
  try {
    const { reservation_id } = req.params;
    const reserva = await Reservation.findOne({ reservation_id });
    if (!reserva) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }
    if (!puedeVerReserva(req, reserva)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const lista = await BookingAuditLog.find({ booking_id: reservation_id })
      .sort({ timestamp: 1 })
      .lean();

    // Extra: apartado "qué cambió" (no se persiste en booking_audit_log, solo en la respuesta JSON)
    const listaConResumen = lista.map((doc) => {
      const { resumen_cambios, detalle_cambios } = describeReservationAuditChanges(
        doc.previous_state,
        doc.new_state,
        doc.action
      );
      return { ...doc, resumen_cambios, detalle_cambios };
    });

    res.json(listaConResumen);
  } catch (err) {
    res.status(500).json({ error: 'Error al leer auditoría', detalle: err.message });
  }
}

module.exports = { getBookingAudit };
