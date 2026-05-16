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
  if (typeof val === 'object') return JSON.stringify(val);
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
    const ta = valorTextoAuditoria(antes);
    const tb = valorTextoAuditoria(despues);
    detalle_cambios.push({
      campo: key,
      etiqueta,
      antes,
      despues,
    });
    resumen_cambios.push(`${etiqueta}: ${ta} → ${tb}`);
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