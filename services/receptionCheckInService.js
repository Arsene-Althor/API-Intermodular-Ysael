/**
 * Check-in en recepción (distinto de la fecha check_in de la reserva).
 * Ventana habitual: mismo día de entrada, desde las 12:00 hasta CHECK_IN_WINDOW_END_HOUR.
 * Fuera de ventana y antes del check_out: check-in tardío con recargo.
 */

function parseHourEnv(name, defaultHour) {
  const n = Number.parseInt(process.env[name], 10);
  if (Number.isFinite(n) && n >= 0 && n <= 23) return n;
  return defaultHour;
}

function parseFeeEnv() {
  const n = Number.parseFloat(process.env.CHECK_IN_LATE_FEE_EUR);
  if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100;
  return 25;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Inicio ventana: día de entrada de la reserva a las 12:00 (coherente con alta de reserva). */
function windowStartForReservation(reservation) {
  const start = new Date(reservation.check_in);
  start.setHours(12, 0, 0, 0);
  return start;
}

/** Fin ventana: mismo día calendario que entrada, hora configurada (por defecto 22:00). */
function windowEndForReservation(reservation) {
  const endHour = parseHourEnv('CHECK_IN_WINDOW_END_HOUR', 22);
  const day = startOfLocalDay(reservation.check_in);
  day.setHours(endHour, 0, 0, 0);
  return day;
}

/**
 * @returns {'already'|'too_early'|'normal'|'late'|'expired'|'cancelled'}
 */
function evaluateReceptionCheckIn(reservation, now = new Date()) {
  if (reservation.cancelation_date != null) return { status: 'cancelled' };
  if (reservation.reception_check_in_at) return { status: 'already', at: reservation.reception_check_in_at };

  const checkOut = new Date(reservation.check_out);
  if (now >= checkOut) return { status: 'expired' };

  const wStart = windowStartForReservation(reservation);
  const wEnd = windowEndForReservation(reservation);

  if (now < wStart) {
    return { status: 'too_early', window_start: wStart, window_end: wEnd };
  }
  if (now <= wEnd) {
    return { status: 'normal', window_start: wStart, window_end: wEnd, late_fee: 0 };
  }
  return {
    status: 'late',
    window_start: wStart,
    window_end: wEnd,
    late_fee: parseFeeEnv(),
  };
}

module.exports = {
  evaluateReceptionCheckIn,
  parseFeeEnv,
  windowStartForReservation,
  windowEndForReservation,
};
