const mongoose = require('mongoose');

const OPERATIONAL_SETTINGS_KEY = 'hotel_operational';

const operationalSettingsSchema = new mongoose.Schema(
  {
    key: { 
      type: String,
      default: OPERATIONAL_SETTINGS_KEY,
      unique: true,
      immutable: true
    },
    booking_audit_enabled: {
      type: Boolean,
      default: true
    },
    /** Horas desde salida estándar (11:00) para que el cliente solicite late/ampl. corta. */
    client_flex_request_window_hours: {
      type: Number,
      default: 12,
      min: 1,
      max: 48
    },
  },
  { timestamps: true },
);

const OperationalSettings = mongoose.model('OperationalSettings', operationalSettingsSchema);
module.exports = OperationalSettings;
module.exports.OPERATIONAL_SETTINGS_KEY = OPERATIONAL_SETTINGS_KEY;
