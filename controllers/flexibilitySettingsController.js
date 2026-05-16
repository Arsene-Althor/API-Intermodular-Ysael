const {
  getMergedFlexibilitySettings,
  updateFlexibilitySettings,
} = require('../services/flexibilitySettingsService');

async function getFlexibilitySettings(req, res) {
  try {
    const settings = await getMergedFlexibilitySettings();
    return res.json(settings);
  } catch (err) {
    console.error('getFlexibilitySettings', err);
    return res.status(500).json({ error: 'Error al leer configuración de flexibilidad', detalle: err.message });
  }
}

async function putFlexibilitySettings(req, res) {
  try {
    const body = req.body || {};
    const settings = await updateFlexibilitySettings({
      early_checkin_rate_per_hour: body.early_checkin_rate_per_hour,
      late_checkout_rate_per_hour: body.late_checkout_rate_per_hour,
      min_billable_hours: body.min_billable_hours,
      max_supplement_eur: body.max_supplement_eur,
      notify_client_on_decision: body.notify_client_on_decision,
      free_access_tiers: body.free_access_tiers,
      discount_bronze_percent: body.discount_bronze_percent,
      discount_silver_percent: body.discount_silver_percent,
      discount_gold_percent: body.discount_gold_percent,
      early_min_hour: body.early_min_hour,
      late_max_hour: body.late_max_hour,
      max_early_hours: body.max_early_hours,
      max_late_hours: body.max_late_hours,
    });
    return res.json({ ok: true, settings });
  } catch (err) {
    console.error('putFlexibilitySettings', err);
    return res.status(500).json({ error: 'Error al guardar configuración', detalle: err.message });
  }
}

module.exports = { getFlexibilitySettings, putFlexibilitySettings };
