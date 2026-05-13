/**
 * Modelo de factura + generación PDF (pdfkit) para GET /reservation/:id/invoice
 */
const PDFDocument = require('pdfkit');

const IVA_RATE = Math.min(0.99, Math.max(0, parseFloat(process.env.INVOICE_IVA_RATE || '0.10')));
const HOTEL_NAME = process.env.HOTEL_INVOICE_NAME || 'Hotel Pere María';
const HOTEL_ADDRESS = process.env.HOTEL_INVOICE_ADDRESS || 'Dirección fiscal (configurar HOTEL_INVOICE_ADDRESS en .env)';
const HOTEL_CIF = process.env.HOTEL_INVOICE_CIF || 'B00000000';

function buildInvoiceModel(reservation, clientUser, room) {
  const totalTTC = Number(reservation.price) || 0;
  const base = Math.round((totalTTC / (1 + IVA_RATE)) * 100) / 100;
  const iva = Math.round((totalTTC - base) * 100) / 100;
  const ms = new Date(reservation.check_out) - new Date(reservation.check_in);
  const nights = Math.max(1, Math.ceil(ms / 86400000));

  return {
    invoice_number: reservation.invoice_number,
    hotel: { name: HOTEL_NAME, address: HOTEL_ADDRESS, cif: HOTEL_CIF },
    client: {
      user_id: clientUser?.user_id || reservation.user_id,
      name: clientUser ? `${clientUser.name || ''} ${clientUser.surname || ''}`.trim() : '—',
      email: clientUser?.email || '—',
    },
    stay: {
      reservation_id: reservation.reservation_id,
      room_id: reservation.room_id,
      room_type: room?.type || '—',
      room_desc: room?.description || '',
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      nights,
    },
    totals: { base, iva, iva_rate: IVA_RATE, total: totalTTC },
    issued_at: reservation.checkout_completed_at || new Date(),
  };
}

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return x.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function writeInvoicePdf(doc, m) {
  doc.fontSize(18).text('FACTURA', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#333');
  doc.text(`Nº factura: ${m.invoice_number}`);
  doc.text(`Fecha emisión: ${fmtDate(m.issued_at)}`);
  doc.moveDown();

  doc.fontSize(12).fillColor('#000').text(m.hotel.name, { continued: false });
  doc.fontSize(9).fillColor('#444');
  doc.text(`CIF: ${m.hotel.cif}`);
  doc.text(m.hotel.address);
  doc.moveDown();

  doc.fontSize(11).fillColor('#000').text('Cliente', { underline: true });
  doc.fontSize(9).fillColor('#444');
  doc.text(`${m.client.name}`);
  doc.text(`ID: ${m.client.user_id}`);
  doc.text(`Email: ${m.client.email}`);
  doc.moveDown();

  doc.fontSize(11).fillColor('#000').text('Estancia', { underline: true });
  doc.fontSize(9).fillColor('#444');
  doc.text(`Reserva: ${m.stay.reservation_id}`);
  doc.text(`Habitación: ${m.stay.room_id} (${m.stay.room_type})`);
  doc.text(`Entrada: ${fmtDate(m.stay.check_in)}  ·  Salida: ${fmtDate(m.stay.check_out)}`);
  doc.text(`Noches: ${m.stay.nights}`);
  doc.moveDown();

  doc.fontSize(11).text('Importes (IVA incluido en total)', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  doc.text(`Base imponible: ${m.totals.base.toFixed(2)} €`);
  doc.text(`IVA (${(m.totals.iva_rate * 100).toFixed(0)}%): ${m.totals.iva.toFixed(2)} €`);
  doc.fontSize(12).text(`TOTAL: ${m.totals.total.toFixed(2)} €`, { continued: false });
  doc.moveDown(2);
  doc.fontSize(8).fillColor('#666').text('Documento generado electrónicamente. Conserve este PDF como justificante fiscal.', {
    width: 480,
  });
}

/**
 * Escribe el PDF en la respuesta HTTP (attachment).
 * @param {import('express').Response} res
 */
function streamInvoicePdf(res, filename, reservation, clientUser, room) {
  if (!reservation.invoice_number) {
    const err = new Error('NO_INVOICE');
    err.code = 'NO_INVOICE';
    throw err;
  }
  const model = buildInvoiceModel(reservation, clientUser, room);
  const safe = String(filename).replace(/[^\w.-]+/g, '_');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);

  const doc = new PDFDocument({
    margin: 48,
    info: { Title: `Factura ${model.invoice_number}`, Author: model.hotel.name },
  });
  doc.pipe(res);
  writeInvoicePdf(doc, model);
  doc.end();
}

module.exports = {
  buildInvoiceModel,
  streamInvoicePdf,
  HOTEL_NAME,
  IVA_RATE,
};
