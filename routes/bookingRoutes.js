/**
 * P19 · Alias REST "bookings" sobre reservas (MongoDB: colección reservations, id RSV-xxxxx).
 */
const express = require('express');
const router = express.Router();
const flexibilityController = require('../controllers/flexibilityController');
const stayExtensionController = require('../controllers/stayExtensionController');
const { requireLogin, requireRole } = require('../middleware/authMiddleware');
const { capturePreviousReservationState } = require('../middleware/bookingAuditMiddleware');

router.use(requireLogin);

router.get(
  '/flexibility/pending',
  requireRole(['admin', 'employee']),
  flexibilityController.listPendingFlexibility,
);

router.get('/:id/flexibility', flexibilityController.getFlexibilityStatus);

router.patch(
  '/:id/request-early-checkin',
  capturePreviousReservationState,
  flexibilityController.requestEarlyCheckinBooking,
);

router.patch(
  '/:id/request-late-checkout',
  capturePreviousReservationState,
  flexibilityController.requestLateCheckoutBooking,
);

router.patch(
  '/:id/extend-stay',
  capturePreviousReservationState,
  stayExtensionController.extendStay,
);

router.patch(
  '/:id/flexibility/early-checkin/review',
  requireRole(['admin', 'employee']),
  capturePreviousReservationState,
  flexibilityController.reviewEarlyCheckin,
);

router.patch(
  '/:id/flexibility/late-checkout/review',
  requireRole(['admin', 'employee']),
  capturePreviousReservationState,
  flexibilityController.reviewLateCheckout,
);

module.exports = router;
