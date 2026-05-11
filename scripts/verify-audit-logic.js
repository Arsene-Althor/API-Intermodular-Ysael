/**
 * Comprobación rápida sin levantar servidor: lógica de resumen de auditoría.
 * Uso: npm run verify:audit
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { describeReservationAuditChanges } = require('../services/auditService');

function fail(msg) {
  console.error('verify:audit FALLO —', msg);
  process.exit(1);
}

const creada = describeReservationAuditChanges(null, { room_id: 'HAB-101' }, 'CREATED');
if (!Array.isArray(creada.resumen_cambios) || creada.resumen_cambios.length === 0) {
  fail('CREATED debe devolver resumen_cambios');
}

const mod = describeReservationAuditChanges(
  { price: 100, room_id: 'HAB-101' },
  { price: 120, room_id: 'HAB-102' },
  'UPDATED'
);
if (!mod.resumen_cambios.some((l) => l.includes('Precio') || l.includes('Habitación'))) {
  fail('UPDATED debe listar al menos precio o habitación');
}
if (!Array.isArray(mod.detalle_cambios) || mod.detalle_cambios.length < 1) {
  fail('detalle_cambios debe tener entradas');
}

const igual = describeReservationAuditChanges({ price: 1 }, { price: 1 }, 'UPDATED');
if (!igual.resumen_cambios.some((l) => l.includes('Sin diferencias'))) {
  fail('Estados iguales deben generar mensaje de sin diferencias');
}

console.log('verify:audit OK (describeReservationAuditChanges)');
