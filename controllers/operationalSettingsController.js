const {
  getMergedOperationalSettings,
  updateOperationalSettings,
} = require('../services/operationalSettingsService');

async function getOperationalSettings(req, res) {
  try {
    const settings = await getMergedOperationalSettings();
    return res.json(settings);
  } catch (err) {
    console.error('getOperationalSettings', err);
    return res.status(500).json({ error: 'Error al leer configuración operativa', detalle: err.message });
  }
}

async function putOperationalSettings(req, res) {
  try {
    const body = req.body || {};
    const settings = await updateOperationalSettings({
      booking_audit_enabled: body.booking_audit_enabled,
      client_flex_request_window_hours: body.client_flex_request_window_hours,
    });
    return res.json({ ok: true, settings });
  } catch (err) {
    console.error('putOperationalSettings', err);
    return res.status(500).json({ error: 'Error al guardar configuración operativa', detalle: err.message });
  }
}

module.exports = { getOperationalSettings, putOperationalSettings };
