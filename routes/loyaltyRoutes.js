const express = require('express');
const router = express.Router();
const loyaltyStatsController = require('../controllers/loyaltyStatsController');
const { requireLogin, requireRole } = require('../middleware/authMiddleware');

router.use(requireLogin);

/** P9 · Estadísticas del cliente autenticado (recalcula desde reservas y guarda en ClientLoyaltyStats). */
router.get('/me', loyaltyStatsController.getMyLoyaltyStats);
router.post('/me/sync', loyaltyStatsController.syncMyLoyaltyStats);

router.get(
  '/user/:userId',
  requireRole(['admin', 'employee']),
  loyaltyStatsController.getUserLoyaltyStats,
);

module.exports = router;
