// Rutas para reservas
const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');
const auditController = require('../controllers/auditController');
const { requireLogin, requireRole } = require('../middleware/authMiddleware');
const {capturePreviousReservationState, capturePreviousForNewReservation} = require('../middleware/bookingAuditMiddleware');

// Todas requieren estar autenticado
router.use(requireLogin);

// Añadir Reserva (estado anterior siempre null)
router.post('/add', capturePreviousForNewReservation, reservationController.addReservation);
// Eliminar y modificar reserva (middleware lee estado previo en Mongo)
router.post('/cancel', capturePreviousReservationState, reservationController.cancelReservation);
router.delete('/cancel/:reservation_id',capturePreviousReservationState, reservationController.cancelReservation);
router.patch('/update',capturePreviousReservationState, reservationController.updateReservation);

// Obtener reservas del usuario logueado (cliente u otros; antes de rol admin/empleado)
router.get('/mine', reservationController.getMine);
router.post('/getPrice', reservationController.calculatePrice);
router.post('/getCancelationPrice', reservationController.calculateCancelationPrice);

// Rutas con nombre fijo primero (si no, "all" podría pillarse como :reservation_id)
router.get('/all', requireRole(['admin', 'employee']), reservationController.getAllReservations);
router.get('/allActive', requireRole(['admin', 'employee']), reservationController.getActiveReservations);
router.get('/one', requireRole(['admin', 'employee']), reservationController.getReservation);

// Auditoría: /reservation/RSV-xxxxx/audit
router.get('/:reservation_id/audit', auditController.getBookingAudit);

module.exports = router;