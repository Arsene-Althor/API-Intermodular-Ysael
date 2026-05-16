const User = require('../models/User');
const { sendEmail } = require('../config/mailer');
const { getMergedFlexibilitySettings } = require('./flexibilitySettingsService');

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function kindLabel(kind, block) {
  if (kind === 'early') return 'entrada anticipada';
  if (block?.late_mode === 'facilities') return 'salida tardía en instalaciones (sin habitación)';
  return 'salida tardía';
}

/**
 * Email al huésped cuando la solicitud queda approved o rejected (incl. auto-aprobación).
 */
async function notifyFlexibilityDecision({ reservation, kind, block }) {
  if (!block || !['approved', 'rejected'].includes(block.status)) {
    return { sent: false, skipped: true };
  }

  const settings = await getMergedFlexibilitySettings();
  if (!settings.notify_client_on_decision) {
    return { sent: false, skipped: true, reason: 'notificaciones desactivadas en configuración' };
  }

  const user = await User.findOne({ user_id: reservation.user_id }).select('email name surname').lean();
  if (!user?.email) {
    return { sent: false, skipped: true, reason: 'cliente sin email' };
  }

  const tipo = kindLabel(kind, block);
  const aprobada = block.status === 'approved';
  const subject = aprobada
    ? `Hotel Pere María — ${tipo} aprobada (${reservation.reservation_id})`
    : `Hotel Pere María — ${tipo} no aprobada (${reservation.reservation_id})`;

  const horaSolicitada = fmtDate(block.requested_time);
  let feeLine = '';
  if (aprobada && Number(block.final_fee) > 0) {
    const h = block.hours_difference != null ? Number(block.hours_difference).toFixed(2) : '—';
    const rate = block.rate_per_hour != null ? Number(block.rate_per_hour).toFixed(2) : '—';
    feeLine = `<p><strong>Suplemento:</strong> ${Number(block.final_fee).toFixed(2)} € (${h} h × ${rate} €/h; descuento fidelidad ${block.discount_percent || 0} %)</p>`;
  }

  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px">
  <h2 style="color:#2E86C1">Solicitud de ${tipo}</h2>
  <p>Hola ${user.name || ''} ${user.surname || ''},</p>
  <p>Reserva <strong>${reservation.reservation_id}</strong>:
    <strong style="color:${aprobada ? '#1E7B34' : '#C0392B'}">${aprobada ? 'APROBADA' : 'RECHAZADA'}</strong>.</p>
  <ul>
    <li>Habitación: ${reservation.room_id}</li>
    <li>Hora solicitada: ${horaSolicitada}</li>
    <li>Rango fidelidad: ${block.loyalty_tier || 'bronze'}</li>
  </ul>
  ${feeLine}
  ${block.review_note ? `<p><em>Nota:</em> ${block.review_note}</p>` : ''}
  ${aprobada ? '<p>El suplemento se ha sumado al total de la reserva.</p>' : '<p>Contacta con recepción si necesitas otra franja.</p>'}
  <p style="font-size:12px;color:#666">Hotel Pere María</p>
</div>`;

  const sent = await sendEmail(user.email, subject, html);
  return { sent, to: user.email };
}

module.exports = { notifyFlexibilityDecision };
