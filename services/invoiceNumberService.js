const Reservation = require('../models/Reservation');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lee configuración de numeración desde `.env`.
 * Formato por defecto: `FAC-2026-0001` (prefijo FAC, año 4 cifras, secuencial 4 dígitos).
 */
function getInvoiceNumberConfig() {
  const prefix = ((process.env.INVOICE_NUMBER_PREFIX ?? 'FAC').trim() || 'FAC').slice(0, 24);
  const sepRaw = process.env.INVOICE_NUMBER_SEPARATOR;
  const sep = sepRaw === undefined || sepRaw === null ? '-' : String(sepRaw).slice(0, 3) || '-';

  const includeYear =
    process.env.INVOICE_NUMBER_INCLUDE_YEAR !== '0' &&
    String(process.env.INVOICE_NUMBER_INCLUDE_YEAR).toLowerCase() !== 'false';

  let digits = parseInt(process.env.INVOICE_NUMBER_SEQ_DIGITS ?? '4', 10);
  if (Number.isNaN(digits) || digits < 1) digits = 4;
  digits = Math.min(12, digits);

  const template = (process.env.INVOICE_NUMBER_TEMPLATE || '').trim();

  return { prefix, sep, includeYear, digits, template };
}

/**
 * Construye el número de factura visible (se guarda en `Reservation.invoice_number`).
 * `template` opcional: literal con `{PREFIX}`, `{YEAR}`, `{SEQ}` (SEQ ya rellenado con ceros).
 */
function formatInvoiceNumber(seq, year, cfg) {
  const seqStr = String(seq).padStart(cfg.digits, '0');
  if (cfg.template) {
    return cfg.template
      .replace(/\{PREFIX\}/g, cfg.prefix)
      .replace(/\{YEAR\}/g, String(year))
      .replace(/\{SEQ\}/g, seqStr);
  }
  if (cfg.includeYear) {
    return `${cfg.prefix}${cfg.sep}${year}${cfg.sep}${seqStr}`;
  }
  return `${cfg.prefix}${cfg.sep}${seqStr}`;
}

/** Regex que captura el número secuencial del último segmento numérico del formato actual. */
function buildSequenceCaptureRegex(year, cfg) {
  const esc = escapeRegex;
  if (cfg.template) {
    const withYear = cfg.template
      .replace(/\{PREFIX\}/g, esc(cfg.prefix))
      .replace(/\{YEAR\}/g, String(year));
    if (!/\{SEQ\}/.test(cfg.template)) {
      return null;
    }
    const parts = withYear.split('{SEQ}');
    if (parts.length !== 2) return null;
    return new RegExp(`^${parts[0]}(\\d+)${escapeRegex(parts[1])}$`);
  }
  if (cfg.includeYear) {
    return new RegExp(`^${esc(cfg.prefix)}${esc(cfg.sep)}${year}${esc(cfg.sep)}(\\d+)$`);
  }
  return new RegExp(`^${esc(cfg.prefix)}${esc(cfg.sep)}(\\d+)$`);
}

/**
 * Siguiente `invoice_number` único según configuración y año de referencia (fecha de checkout).
 */
async function nextInvoiceNumber(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  const cfg = getInvoiceNumberConfig();
  const re = buildSequenceCaptureRegex(year, cfg);
  if (!re) {
    throw new Error('INVOICE_NUMBER_TEMPLATE debe incluir exactamente un {SEQ}');
  }

  const candidates = await Reservation.find({
    invoice_number: { $type: 'string', $regex: re },
  })
    .select('invoice_number')
    .lean();

  let maxSeq = 0;
  for (const row of candidates) {
    const m = re.exec(row.invoice_number);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) maxSeq = Math.max(maxSeq, n);
    }
  }

  return formatInvoiceNumber(maxSeq + 1, year, cfg);
}

module.exports = {
  getInvoiceNumberConfig,
  formatInvoiceNumber,
  nextInvoiceNumber,
};
