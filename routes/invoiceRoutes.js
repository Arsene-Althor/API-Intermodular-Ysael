const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/authMiddleware');
const invoiceController = require('../controllers/invoiceController');

router.use(requireLogin);

/** GET /invoices?userId=CLI-00001 (acepta también user_id en query) */
router.get('/', invoiceController.listInvoicesByUser);

module.exports = router;
