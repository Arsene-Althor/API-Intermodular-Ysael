const express = require('express');
const router = express.Router();
const { requireLogin, requireRole } = require('../middleware/authMiddleware');
const invoiceSettingsController = require('../controllers/invoiceSettingsController');
const flexibilitySettingsController = require('../controllers/flexibilitySettingsController');
const operationalSettingsController = require('../controllers/operationalSettingsController');

router.use(requireLogin);

router.get('/invoice', requireRole(['admin', 'employee']), invoiceSettingsController.getInvoiceSettings);
router.put('/invoice', requireRole(['admin', 'employee']), invoiceSettingsController.putInvoiceSettings);

router.get('/flexibility', requireRole(['admin', 'employee']), flexibilitySettingsController.getFlexibilitySettings);
router.put('/flexibility', requireRole(['admin', 'employee']), flexibilitySettingsController.putFlexibilitySettings);

router.get('/operational', requireRole(['admin', 'employee']), operationalSettingsController.getOperationalSettings);
router.put('/operational', requireRole(['admin', 'employee']), operationalSettingsController.putOperationalSettings);

module.exports = router;
