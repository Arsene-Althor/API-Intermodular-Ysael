const { getMergedHotelInvoiceDisplay, updateInvoiceSettings } = require('../services/invoiceSettingsService');

function toResponse(merged) {
  return {
    hotel_commercial_name: merged.name,
    hotel_cif: merged.cif,
    hotel_address: merged.address,
    fiscal_notes: merged.fiscal_notes,
    iva_rate: merged.iva_rate,
  };
}

async function getInvoiceSettings(req, res) {
  try {
    const merged = await getMergedHotelInvoiceDisplay();
    return res.json(toResponse(merged));
  } catch (err) {
    console.error('getInvoiceSettings', err);
    return res.status(500).json({ error: 'Error al leer configuración de factura', detalle: err.message });
  }
}

async function putInvoiceSettings(req, res) {
  try {
    const body = req.body || {};
    const merged = await updateInvoiceSettings({
      hotel_commercial_name: body.hotel_commercial_name,
      hotel_cif: body.hotel_cif,
      hotel_address: body.hotel_address,
      fiscal_notes: body.fiscal_notes,
      iva_rate: body.iva_rate,
    });
    return res.json({ ok: true, settings: toResponse(merged) });
  } catch (err) {
    console.error('putInvoiceSettings', err);
    return res.status(500).json({ error: 'Error al guardar configuración de factura', detalle: err.message });
  }
}

module.exports = { getInvoiceSettings, putInvoiceSettings };
