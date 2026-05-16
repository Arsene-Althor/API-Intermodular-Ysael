const mongoose = require('mongoose');

const FLEXIBILITY_SETTINGS_KEY = 'hotel_flexibility_pricing';

const flexibilitySettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: FLEXIBILITY_SETTINGS_KEY, unique: true, immutable: true },
    /** € por cada hora de diferencia (entrada anticipada vs 12:00). */
    early_checkin_rate_per_hour: { type: Number, min: 0, default: null },
    /** € por cada hora de diferencia (salida tardía vs 11:00). */
    late_checkout_rate_per_hour: { type: Number, min: 0, default: null },
    /** Mínimo de horas facturables (p. ej. 1 h aunque la diferencia sea menor). */
    min_billable_hours: { type: Number, min: 0, default: null },
    /** Tope opcional del suplemento TTC antes de descuento fidelidad (0 = sin tope). */
    max_supplement_eur: { type: Number, min: 0, default: null },
    /** Enviar email al cliente al aprobar o rechazar. */
    notify_client_on_decision: { type: Boolean, default: true },
    /** Rangos con suplemento 0 € (p. ej. ['gold']). */
    free_access_tiers: { type: [String], default: () => [] },
    discount_bronze_percent: { type: Number, min: 0, max: 100, default: null },
    discount_silver_percent: { type: Number, min: 0, max: 100, default: null },
    discount_gold_percent: { type: Number, min: 0, max: 100, default: null },
    /** Hora mínima entrada anticipada (0–23). */
    early_min_hour: { type: Number, min: 0, max: 23, default: null },
    /** Hora máxima salida tardía (0–23). */
    late_max_hour: { type: Number, min: 0, max: 23, default: null },
    /** Máx. horas de adelanto respecto a las 12:00 (0 = solo límite por early_min_hour). */
    max_early_hours: { type: Number, min: 0, default: null },
    /** Máx. horas de retraso respecto a las 11:00. */
    max_late_hours: { type: Number, min: 0, default: null },
  },
  { timestamps: true },
);

const FlexibilitySettings = mongoose.model('FlexibilitySettings', flexibilitySettingsSchema);
module.exports = FlexibilitySettings;
module.exports.FLEXIBILITY_SETTINGS_KEY = FLEXIBILITY_SETTINGS_KEY;
