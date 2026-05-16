const FlexibilitySettings = require('../models/FlexibilitySettings');
const FLEXIBILITY_SETTINGS_KEY = FlexibilitySettings.FLEXIBILITY_SETTINGS_KEY;

const VALID_TIERS = ['bronze', 'silver', 'gold'];

function parseEnvNumber(name, fallback) {
  const n = Number.parseFloat(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseEnvInt(name, fallback) {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envDefaults() {
  return {
    early_checkin_rate_per_hour: parseEnvNumber('FLEX_EARLY_RATE_PER_HOUR', 20),
    late_checkout_rate_per_hour: parseEnvNumber('FLEX_LATE_RATE_PER_HOUR', 20),
    min_billable_hours: parseEnvNumber('FLEX_MIN_BILLABLE_HOURS', 1),
    max_supplement_eur: parseEnvNumber('FLEX_MAX_SUPPLEMENT_EUR', 0),
    notify_client_on_decision: process.env.FLEX_NOTIFY_CLIENT !== '0',
    free_access_tiers: [],
    discount_bronze_percent: parseEnvInt('FLEX_DISCOUNT_BRONZE_PERCENT', 0),
    discount_silver_percent: parseEnvInt('FLEX_DISCOUNT_SILVER_PERCENT', 15),
    discount_gold_percent: parseEnvInt('FLEX_DISCOUNT_GOLD_PERCENT', 35),
    early_min_hour: parseEnvInt('FLEX_EARLY_MIN_HOUR', 8),
    late_max_hour: parseEnvInt('FLEX_LATE_MAX_HOUR', 20),
    facilities_late_max_hour: parseEnvInt('FLEX_FACILITIES_LATE_MAX_HOUR', 20),
    max_early_hours: parseEnvInt('FLEX_MAX_EARLY_HOURS', 4),
    max_late_hours: parseEnvInt('FLEX_MAX_LATE_HOURS', 7),
  };
}

function pickNum(doc, field, fallback) {
  if (doc && doc[field] != null && Number.isFinite(Number(doc[field]))) {
    return Number(doc[field]);
  }
  return fallback;
}

function pickBool(doc, field, fallback) {
  if (doc && doc[field] != null) return Boolean(doc[field]);
  return fallback;
}

function pickFreeTiers(doc, fallback) {
  if (doc && Array.isArray(doc.free_access_tiers)) {
    return doc.free_access_tiers.filter((t) => VALID_TIERS.includes(t));
  }
  return fallback;
}

async function getMergedFlexibilitySettings() {
  const def = envDefaults();
  let doc = null;
  try {
    doc = await FlexibilitySettings.findOne({ key: FLEXIBILITY_SETTINGS_KEY }).lean();
  } catch (e) {
    console.error('getMergedFlexibilitySettings', e);
  }
  const maxRaw = pickNum(doc, 'max_supplement_eur', def.max_supplement_eur);
  return {
    early_checkin_rate_per_hour: pickNum(doc, 'early_checkin_rate_per_hour', def.early_checkin_rate_per_hour),
    late_checkout_rate_per_hour: pickNum(doc, 'late_checkout_rate_per_hour', def.late_checkout_rate_per_hour),
    min_billable_hours: pickNum(doc, 'min_billable_hours', def.min_billable_hours),
    max_supplement_eur: maxRaw > 0 ? maxRaw : 0,
    notify_client_on_decision: pickBool(doc, 'notify_client_on_decision', def.notify_client_on_decision),
    free_access_tiers: pickFreeTiers(doc, def.free_access_tiers),
    discount_bronze_percent: pickNum(doc, 'discount_bronze_percent', def.discount_bronze_percent),
    discount_silver_percent: pickNum(doc, 'discount_silver_percent', def.discount_silver_percent),
    discount_gold_percent: pickNum(doc, 'discount_gold_percent', def.discount_gold_percent),
    early_min_hour: pickNum(doc, 'early_min_hour', def.early_min_hour),
    late_max_hour: pickNum(doc, 'late_max_hour', def.late_max_hour),
    max_early_hours: pickNum(doc, 'max_early_hours', def.max_early_hours),
    max_late_hours: pickNum(doc, 'max_late_hours', def.max_late_hours),
  };
}

function normalizeFreeTiers(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((t) => String(t).trim().toLowerCase()).filter((t) => VALID_TIERS.includes(t)))];
}

async function updateFlexibilitySettings(payload) {
  const p = payload || {};
  const $set = { key: FLEXIBILITY_SETTINGS_KEY };

  for (const field of [
    'early_checkin_rate_per_hour',
    'late_checkout_rate_per_hour',
    'min_billable_hours',
    'max_supplement_eur',
    'discount_bronze_percent',
    'discount_silver_percent',
    'discount_gold_percent',
    'early_min_hour',
    'late_max_hour',
    'max_early_hours',
    'max_late_hours',
  ]) {
    if (field in p) {
      if (p[field] === null || p[field] === '') {
        $set[field] = null;
      } else {
        const n = Number(p[field]);
        if (Number.isFinite(n) && n >= 0) $set[field] = n;
      }
    }
  }
  if ('notify_client_on_decision' in p) {
    $set.notify_client_on_decision = Boolean(p.notify_client_on_decision);
  }
  if ('free_access_tiers' in p) {
    $set.free_access_tiers = normalizeFreeTiers(p.free_access_tiers);
  }

  await FlexibilitySettings.findOneAndUpdate({ key: FLEXIBILITY_SETTINGS_KEY }, { $set }, { upsert: true, new: true });
  return getMergedFlexibilitySettings();
}

module.exports = {
  getMergedFlexibilitySettings,
  updateFlexibilitySettings,
  envDefaults,
  VALID_TIERS,
};
