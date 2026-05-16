// Rutas para reservas
const express = require('express');
const router = express.Router();
const reservationController = require('../controllers/reservationController');
const auditController = require('../controllers/auditController');
const invoiceController = require('../controllers/invoiceController');
const flexibilityController = require('../controllers/flexibilityController');
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

// Auditoría global (antes de /:reservation_id/audit)
router.get('/audits', requireRole(['admin', 'employee']), auditController.listAuditLogs);

// Facturas: rutas fijas antes de /:reservation_id/...
router.get('/invoices/history', requireRole(['admin', 'employee']), invoiceController.listInvoiceHistory);
router.post(
  '/checkout',
  requireRole(['admin', 'employee']),
  capturePreviousReservationState,
  reservationController.checkoutReservation,
);
router.post(
  '/check-in',
  requireRole(['admin', 'employee']),
  capturePreviousReservationState,
  reservationController.registerReceptionCheckIn,
);
router.get(
  '/:reservation_id/check-in-status',
  requireRole(['admin', 'employee']),
  reservationController.getReceptionCheckInStatus,
);

// P19 · Flexibilidad (check-in anticipado / check-out tardío)
router.get(
  '/flexibility/pending',
  requireRole(['admin', 'employee']),
  flexibilityController.listPendingFlexibility,
);
router.get('/:reservation_id/flexibility', flexibilityController.getFlexibilityStatus);
router.post(
  '/:reservation_id/flexibility/early-checkin',
  capturePreviousReservationState,
  flexibilityController.requestEarlyCheckin,
);
router.patch(
  '/:reservation_id/request-early-checkin',
  capturePreviousReservationState,
  flexibilityController.requestEarlyCheckinBooking,
);
router.post(
  '/:reservation_id/flexibility/late-checkout',
  capturePreviousReservationState,
  flexibilityController.requestLateCheckout,
);
router.patch(
  '/:reservation_id/request-late-checkout',
  capturePreviousReservationState,
  flexibilityController.requestLateCheckoutBooking,
);
router.patch(
  '/:reservation_id/flexibility/early-checkin/review',
  requireRole(['admin', 'employee']),
  capturePreviousReservationState,
  flexibilityController.reviewEarlyCheckin,
);
router.patch(
  '/:reservation_id/flexibility/late-checkout/review',
  requireRole(['admin', 'employee']),
  capturePreviousReservationState,
  flexibilityController.reviewLateCheckout,
);

router.post('/:reservation_id/confirm-payment', invoiceController.confirmPayment);
router.get('/:reservation_id/billing-info', invoiceController.getBillingInfo);
router.get('/:reservation_id/booking-receipt', invoiceController.getBookingReceiptPdf);
router.get('/:reservation_id/invoice', invoiceController.getInvoicePdf);
router.post(
  '/:reservation_id/invoice/email',
  requireRole(['admin', 'employee']),
  invoiceController.postInvoiceEmail,
);

// Auditoría: /reservation/RSV-xxxxx/audit
router.get('/:reservation_id/audit', auditController.getBookingAudit);

module.exports = router;