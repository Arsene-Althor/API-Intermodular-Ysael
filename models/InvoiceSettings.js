const mongoose = require('mongoose');

const INVOICE_SETTINGS_KEY = 'hotel_invoice_defaults';

const invoiceSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: INVOICE_SETTINGS_KEY, unique: true, immutable: true },
    hotel_commercial_name: { type: String, trim: true, default: '' },
    hotel_cif: { type: String, trim: true, default: '' },
    hotel_address: { type: String, trim: true, default: '' },
    fiscal_notes: { type: String, trim: true, default: '' },
    /** null = usar solo INVOICE_IVA_RATE del .env */
    iva_rate: { type: Number, default: null },
  },
  { timestamps: true },
);

const InvoiceSettings = mongoose.model('InvoiceSettings', invoiceSettingsSchema);
module.exports = InvoiceSettings;
module.exports.INVOICE_SETTINGS_KEY = INVOICE_SETTINGS_KEY;
