const BookingAuditLog = require('../models/BookingAuditLog.js');
const { isBookingAuditEnabled } = require('./operationalSettingsService');

// Cliente → 'user', admin y empleados → 'employee' (así lo pide el modelo)
function actorTypeFromRole(role) {
  return role === 'client' ? 'user' : 'employee';
}

// Copia del documento para guardarlo en el log sin líos de referencias
function cloneState(doc) {
  if (doc == null) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return JSON.parse(JSON.stringify(plain));
}

// Guarda una línea en booking_audit_log (booking_id = RSV-xxxxx, no el _id de Mongo)
const logBookingChange = async ({
  booking_id,
  action,
  actor_id,
  actor_type,
  previous_state,
  new_state,
}) => {
  try {
    const enabled = await isBookingAuditEnabled();
    if (!enabled) return;

    await BookingAuditLog.create({
      booking_id,
      action,
      actor_id,
      actor_type,
      previous_state: cloneState(previous_state),
      new_state: cloneState(new_state),
      timestamp: new Date(),
    });
    console.log(`[Auditoría] '${action}' → reserva ${booking_id}`);
  } catch (error) {
    console.error(`[Auditoría] Error al guardar log (${booking_id}):`, error.message);
  }
};

// Nombres amigables para el resumen de auditoría (campos del documento de reserva)
const ETIQUETA_CAMPO = {
  reservation_id: 'ID reserva',
  room_id: 'Habitación',
  user_id: 'Cliente',
  check_in: 'Entrada',
  check_out: 'Salida',
  price: 'Precio',
  cancelation_date: 'Fecha cancelación',
  createdBy: 'Creado por',
  createdAt: 'Creado el',
  updatedAt: 'Actualizado el',
  invoice_breakdown: 'Desglose factura',
  invoice_number: 'Nº factura',
  checkout_completed_at: 'Checkout completado',
  reception_check_in_at: 'Check-in recepción',
  reception_check_in_late: 'Check-in tardío',
  reception_check_in_late_fee: 'Recargo check-in tardío',
  early_checkin_requested: 'Solicitud entrada anticipada',
  late_checkout_requested: 'Solicitud salida tardía',
};

const ETIQUETA_SUBCAMPO = {
  status: 'Estado',
  requested_time: 'Hora solicitada',
  requested_at: 'Solicitado el',
  final_fee: 'Suplemento',
  base_fee: 'Tarifa base',
  discount_percent: 'Descuento %',
  loyalty_tier: 'Rango',
  hours_difference: 'Horas',
  rate_per_hour: '€/hora',
  availability_ok: 'Disponible',
  auto_approved: 'Auto-aprobado',
  approval_mode: 'Modo',
  reviewed_by: 'Revisado por',
  review_note: 'Nota',
  reviewed_at: 'Revisado el',
  client_notified_at: 'Cliente notificado',
  late_mode: 'Modo salida',
};

function esObjetoPlano(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/** Desglosa early_checkin_requested, etc. en filas por subcampo. */
function expandirDetalleSubdocumentos(campo, etiqueta, antes, despues) {
  if (!esObjetoPlano(antes) && !esObjetoPlano(despues)) {
    const ta = valorTextoAuditoria(antes);
    const tb = valorTextoAuditoria(despues);
    return {
      filas: [{ campo, etiqueta, antes, despues }],
      resumenes: [`${etiqueta}: ${ta} → ${tb}`],
    };
  }
  const a = esObjetoPlano(antes) ? antes : {};
  const b = esObjetoPlano(despues) ? despues : {};
  const subKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const filas = [];
  const resumenes = [];
  for (const sk of subKeys) {
    const va = a[sk];
    const vb = b[sk];
    if (mismoValorAuditoria(va, vb)) continue;
    const subEt = ETIQUETA_SUBCAMPO[sk] || sk;
    const ta = valorTextoAuditoria(va);
    const tb = valorTextoAuditoria(vb);
    filas.push({
      campo: `${campo}.${sk}`,
      etiqueta: `${etiqueta} · ${subEt}`,
      antes: va ?? null,
      despues: vb ?? null,
    });
    resumenes.push(`${etiqueta} · ${subEt}: ${ta} → ${tb}`);
  }
  if (filas.length === 0) {
    filas.push({ campo, etiqueta, antes, despues });
    resumenes.push(`${etiqueta}: (sin cambios en subcampos visibles)`);
  }
  return { filas, resumenes };
}

function formatearSubdocumentoAuditoria(obj) {
  if (!obj || typeof obj !== 'object') return '—';
  const partes = [];
  const mapa = {
    status: 'estado',
    requested_time: 'hora',
    final_fee: 'suplemento',
    base_fee: 'tarifa',
    loyalty_tier: 'rango',
    hours_difference: 'horas',
    auto_approved: 'auto',
    late_mode: 'modo',
  };
  for (const [k, etiqueta] of Object.entries(mapa)) {
    if (obj[k] === undefined || obj[k] === null) continue;
    let v = obj[k];
    if (k === 'requested_time' || k === 'requested_at') {
      const d = new Date(v);
      v = !isNaN(d.getTime()) ? d.toISOString().slice(0, 16).replace('T', ' ') : v;
    } else if (typeof v === 'boolean') {
      v = v ? 'sí' : 'no';
    } else if (k === 'final_fee' || k === 'base_fee') {
      v = `${v} €`;
    }
    partes.push(`${etiqueta} ${v}`);
  }
  if (partes.length > 0) return partes.join(', ');
  const raw = JSON.stringify(obj);
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
}

function valorTextoAuditoria(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
    return val;
  }
  if (typeof val === 'boolean') return val ? 'sí' : 'no';
  if (typeof val === 'object') return formatearSubdocumentoAuditoria(val);
  return String(val);
}

function mismoValorAuditoria(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Extra para GET audit: qué cambió entre previous_state y new_state (solo lectura en respuesta, no se guarda en Mongo)
function describeReservationAuditChanges(previous_state, new_state, action) {
  const resumen_cambios = [];
  const detalle_cambios = [];

  if (action === 'CREATED' || previous_state == null) {
    resumen_cambios.push('Alta de reserva (no había estado anterior).');
    return { resumen_cambios, detalle_cambios };
  }

  const prev = typeof previous_state === 'object' ? previous_state : {};
  const sig = typeof new_state === 'object' ? new_state : {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(sig)]);
  const ignorar = new Set(['_id', '__v']);

  for (const key of keys) {
    if (ignorar.has(key)) continue;
    const antes = prev[key];
    const despues = sig[key];
    if (mismoValorAuditoria(antes, despues)) continue;

    const etiqueta = ETIQUETA_CAMPO[key] || key;
    const exp = expandirDetalleSubdocumentos(key, etiqueta, antes, despues);
    detalle_cambios.push(...exp.filas);
    resumen_cambios.push(...exp.resumenes);
  }

  if (resumen_cambios.length === 0) {
    resumen_cambios.push('Sin diferencias entre el estado anterior y el nuevo (mismos datos).');
  }

  return { resumen_cambios, detalle_cambios };
}

module.exports = {
  logBookingChange,
  actorTypeFromRole,
  cloneState,
  describeReservationAuditChanges,
};