const express = require('express');
const router = express.Router();
const { requireLogin, requireRole } = require('../middleware/authMiddleware');
const invoiceSettingsController = require('../controllers/invoiceSettingsController');

router.use(requireLogin);

router.get('/invoice', requireRole(['admin', 'employee']), invoiceSettingsController.getInvoiceSettings);
router.put('/invoice', requireRole(['admin', 'employee']), invoiceSettingsController.putInvoiceSettings);

module.exports = router;
