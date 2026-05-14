const InvoiceSettings = require('../models/InvoiceSettings');
const INVOICE_SETTINGS_KEY = InvoiceSettings.INVOICE_SETTINGS_KEY;

function envDefaults() {
  const iva = Math.min(0.99, Math.max(0, parseFloat(process.env.INVOICE_IVA_RATE || '0.10')));
  return {
    hotel_commercial_name: process.env.HOTEL_INVOICE_NAME || 'Hotel Pere María',
    hotel_address:
      process.env.HOTEL_INVOICE_ADDRESS || 'Dirección fiscal (configurar HOTEL_INVOICE_ADDRESS en .env)',
    hotel_cif: process.env.HOTEL_INVOICE_CIF || 'B00000000',
    fiscal_notes: '',
    iva_rate: Number.isFinite(iva) ? iva : 0.1,
  };
}

function pickStr(doc, field, fallback) {
  const v = doc && doc[field];
  if (v == null) return fallback;
  const s = String(v).trim();
  return s.length > 0 ? s : fallback;
}

/**
 * Valores efectivos que verán los PDF (BD no vacía gana sobre .env).
 * @returns {Promise<{ name: string, address: string, cif: string, fiscal_notes: string, iva_rate: number }>}
 */
async function getMergedHotelInvoiceDisplay() {
  const def = envDefaults();
  let doc = null;
  try {
    doc = await InvoiceSettings.findOne({ key: INVOICE_SETTINGS_KEY }).lean();
  } catch (e) {
    console.error('getMergedHotelInvoiceDisplay', e);
  }
  let iva_rate = def.iva_rate;
  if (doc && doc.iva_rate != null && Number.isFinite(Number(doc.iva_rate))) {
    iva_rate = Math.min(0.99, Math.max(0, Number(doc.iva_rate)));
  }
  return {
    name: pickStr(doc, 'hotel_commercial_name', def.hotel_commercial_name),
    address: pickStr(doc, 'hotel_address', def.hotel_address),
    cif: pickStr(doc, 'hotel_cif', def.hotel_cif),
    fiscal_notes: doc && doc.fiscal_notes != null ? String(doc.fiscal_notes).trim() : '',
    iva_rate,
  };
}

/**
 * Persiste overrides de facturación (upsert documento único).
 * @param {object} payload
 */
async function updateInvoiceSettings(payload) {
  const p = payload || {};
  const $set = { key: INVOICE_SETTINGS_KEY };

  if ('hotel_commercial_name' in p) $set.hotel_commercial_name = String(p.hotel_commercial_name ?? '');
  if ('hotel_cif' in p) $set.hotel_cif = String(p.hotel_cif ?? '');
  if ('hotel_address' in p) $set.hotel_address = String(p.hotel_address ?? '');
  if ('fiscal_notes' in p) $set.fiscal_notes = String(p.fiscal_notes ?? '');

  if ('iva_rate' in p) {
    if (p.iva_rate === null || p.iva_rate === '' || p.iva_rate === undefined) {
      $set.iva_rate = null;
    } else {
      const n = Number(p.iva_rate);
      if (!Number.isNaN(n)) {
        $set.iva_rate = Math.min(0.99, Math.max(0, n));
      }
    }
  }

  await InvoiceSettings.findOneAndUpdate({ key: INVOICE_SETTINGS_KEY }, { $set }, { upsert: true, new: true });
  return getMergedHotelInvoiceDisplay();
}

module.exports = {
  getMergedHotelInvoiceDisplay,
  updateInvoiceSettings,
  envDefaults,
};
