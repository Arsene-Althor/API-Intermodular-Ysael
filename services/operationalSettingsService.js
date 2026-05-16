const OperationalSettings = require('../models/OperationalSettings');
const { OPERATIONAL_SETTINGS_KEY } = require('../models/OperationalSettings');

function envAuditEnabled() {
  const v = process.env.BOOKING_AUDIT_ENABLED;
  if (v === undefined || v === '') return true;
  return v === '1' || v === 'true' || v === 'yes';
}

function envFlexWindowHours() {
  const n = Number.parseInt(process.env.CLIENT_FLEX_REQUEST_WINDOW_HOURS, 10);
  return Number.isFinite(n) && n >= 1 && n <= 48 ? n : 12;
}

async function getMergedOperationalSettings() {
  const doc = await OperationalSettings.findOne({ key: OPERATIONAL_SETTINGS_KEY }).lean();
  return {
    booking_audit_enabled:
      typeof doc?.booking_audit_enabled === 'boolean'
        ? doc.booking_audit_enabled
        : envAuditEnabled(),
    client_flex_request_window_hours:
      typeof doc?.client_flex_request_window_hours === 'number'
        ? doc.client_flex_request_window_hours
        : envFlexWindowHours(),
  };
}

async function updateOperationalSettings(patch) {
  const update = {};
  if (typeof patch.booking_audit_enabled === 'boolean') {
    update.booking_audit_enabled = patch.booking_audit_enabled;
  }
  if (patch.client_flex_request_window_hours != null) {
    const h = Number(patch.client_flex_request_window_hours);
    if (Number.isFinite(h) && h >= 1 && h <= 48) {
      update.client_flex_request_window_hours = h;
    }
  }
  await OperationalSettings.findOneAndUpdate(
    { key: OPERATIONAL_SETTINGS_KEY },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return getMergedOperationalSettings();
}

async function isBookingAuditEnabled() {
  const s = await getMergedOperationalSettings();
  return s.booking_audit_enabled;
}

module.exports = {
  getMergedOperationalSettings,
  updateOperationalSettings,
  isBookingAuditEnabled,
};
