/**
 * Modelo de factura + generación PDF (pdfkit) para GET /reservation/:id/invoice
 */
const PDFDocument = require('pdfkit');
const { computeInvoiceBreakdown } = require('./invoiceBreakdownService');

const IVA_RATE = Math.min(0.99, Math.max(0, parseFloat(process.env.INVOICE_IVA_RATE || '0.10')));
const HOTEL_NAME = process.env.HOTEL_INVOICE_NAME || 'Hotel Pere María';
const HOTEL_ADDRESS = process.env.HOTEL_INVOICE_ADDRESS || 'Dirección fiscal (configurar HOTEL_INVOICE_ADDRESS en .env)';
const HOTEL_CIF = process.env.HOTEL_INVOICE_CIF || 'B00000000';

function resolveBreakdown(reservation, clientUser, room, extraDocs) {
  if (reservation.invoice_breakdown && typeof reservation.invoice_breakdown === 'object') {
    return reservation.invoice_breakdown;
  }
  return computeInvoiceBreakdown(reservation, clientUser, room, extraDocs || []);
}

function buildInvoiceModel(reservation, clientUser, room, extraDocs) {
  const totalTTC = Number(reservation.price) || 0;
  const base = Math.round((totalTTC / (1 + IVA_RATE)) * 100) / 100;
  const iva = Math.round((totalTTC - base) * 100) / 100;
  const bd = resolveBreakdown(reservation, clientUser, room, extraDocs);

  return {
    invoice_number: reservation.invoice_number,
    hotel: { name: HOTEL_NAME, address: HOTEL_ADDRESS, cif: HOTEL_CIF },
    client: {
      user_id: clientUser?.user_id || reservation.user_id,
      name: clientUser ? `${clientUser.name || ''} ${clientUser.surname || ''}`.trim() : '—',
      email: clientUser?.email || '—',
      dni: clientUser?.dni || '—',
      billing_company_name: clientUser?.billing_company_name || null,
      billing_company_cif: clientUser?.billing_company_cif || null,
    },
    stay: {
      reservation_id: reservation.reservation_id,
      room_id: reservation.room_id,
      room_type: room?.type || '—',
      room_desc: room?.description || '',
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      nights: bd.nights,
    },
    breakdown: bd,
    totals: { base, iva, iva_rate: IVA_RATE, total: totalTTC },
    issued_at: reservation.checkout_completed_at || new Date(),
  };
}

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return x.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function pctLabel(rate) {
  return `${(Number(rate) * 100).toFixed(0)}%`;
}

function writeInvoicePdf(doc, m) {
  const bd = m.breakdown;

  doc.fontSize(18).text('FACTURA', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#333');
  doc.text(`Nº factura: ${m.invoice_number}`);
  doc.text(`Fecha emisión: ${fmtDate(m.issued_at)}`);
  doc.moveDown();

  doc.fontSize(12).fillColor('#000').text('Datos del emisor (hotel)', { underline: true });
  doc.fontSize(10).fillColor('#444');
  doc.text(m.hotel.name);
  doc.text(`CIF/NIF: ${m.hotel.cif}`);
  doc.text(`Dirección: ${m.hotel.address}`);
  doc.moveDown();

  doc.fontSize(12).fillColor('#000').text('Datos del cliente', { underline: true });
  doc.fontSize(10).fillColor('#444');
  doc.text(`${m.client.name}`);
  doc.text(`ID cliente: ${m.client.user_id}`);
  doc.text(`DNI/NIF: ${m.client.dni}`);
  doc.text(`Email: ${m.client.email}`);
  if (m.client.billing_company_name) {
    doc.text(`Empresa: ${m.client.billing_company_name}`);
    if (m.client.billing_company_cif) doc.text(`CIF empresa: ${m.client.billing_company_cif}`);
  }
  doc.moveDown();

  doc.fontSize(12).fillColor('#000').text('Estancia y alojamiento', { underline: true });
  doc.fontSize(10).fillColor('#444');
  doc.text(`Reserva: ${m.stay.reservation_id}`);
  doc.text(`Habitación: ${m.stay.room_id} — ${m.stay.room_type}`);
  if (m.stay.room_desc) doc.text(`Descripción: ${m.stay.room_desc}`);
  doc.text(`Entrada: ${fmtDate(m.stay.check_in)}  ·  Salida: ${fmtDate(m.stay.check_out)}`);
  doc.text(`Noches: ${bd.nights}`);
  doc.moveDown(0.3);

  doc.fontSize(11).fillColor('#000').text('Desglose económico (importes en €, TTC salvo indicación)', { underline: true });
  doc.moveDown(0.25);
  doc.fontSize(9).fillColor('#333');
  doc.text(
    `Precio tarifa/noche (tarifa): ${bd.price_per_night_list.toFixed(2)} €` +
      (bd.room_offer_active
        ? `  ·  Oferta habitación: ${bd.room_offer_percent}%  ·  P/noche aplicado: ${bd.nightly_effective.toFixed(2)} €`
        : ''),
  );
  doc.text(
    `Subtotal alojamiento (${bd.nights} noches × ${bd.nightly_effective.toFixed(2)} €): ${bd.subtotal_hospitality.toFixed(2)} €`,
  );
  if (bd.client_discount_rate > 0) {
    doc.fillColor('#a04000').text(
      `Descuento cliente (${pctLabel(bd.client_discount_rate)} sobre alojamiento): −${bd.client_discount_amount.toFixed(2)} €`,
    );
    doc.fillColor('#333');
    doc.text(`Subtotal tras descuento cliente: ${bd.subtotal_after_client_discount.toFixed(2)} €`);
  }

  doc.moveDown(0.2);
  doc.fontSize(10).fillColor('#000').text('Extras (servicios vinculados a la habitación)', { underline: true });
  doc.fontSize(9).fillColor('#444');
  if (!bd.extras_lines || bd.extras_lines.length === 0) {
    doc.text('Sin servicios extra con cargo en catálogo para esta habitación.');
  } else {
    for (const ex of bd.extras_lines) {
      doc.text(`• ${ex.name} (${ex.service_id}): ${ex.amount.toFixed(2)} €`);
    }
    doc.fillColor('#333').text(`Subtotal extras: ${bd.extras_subtotal.toFixed(2)} €`);
  }

  if (bd.adjustment_amount !== 0) {
    doc.moveDown(0.15);
    doc.fontSize(9).fillColor('#555').text(
      `Ajuste / importe pactado en reserva (diferencia con desglose automático): ${bd.adjustment_amount >= 0 ? '+' : ''}${bd.adjustment_amount.toFixed(2)} €`,
    );
  }

  doc.moveDown(0.4);
  doc.fontSize(10).fillColor('#000').text('Impuestos y total', { underline: true });
  doc.fontSize(9).fillColor('#333');
  doc.text(`Base imponible (desglosada desde total TTC al ${(m.totals.iva_rate * 100).toFixed(0)}% IVA): ${m.totals.base.toFixed(2)} €`);
  doc.text(`IVA (${(m.totals.iva_rate * 100).toFixed(0)}%): ${m.totals.iva.toFixed(2)} €`);
  doc.fontSize(12).fillColor('#000').text(`IMPORTE TOTAL (TTC): ${m.totals.total.toFixed(2)} €`);
  doc.moveDown(1.2);

  doc.fontSize(8).fillColor('#666').text(
    'Pasarela de pago: simulación (sin cobro real). Este documento cumple función informativa y justificante de la estancia facturada.',
    { width: 480 },
  );
  doc.moveDown(0.3);
  doc.text('Documento generado electrónicamente. Conserve este PDF como justificante.', { width: 480 });
}

/**
 * Escribe el PDF en la respuesta HTTP (attachment).
 * @param {import('express').Response} res
 * @param {object[]} [extraDocs] — documentos ExtraService lean (ids de la habitación)
 */
function streamInvoicePdf(res, filename, reservation, clientUser, room, extraDocs) {
  if (!reservation.invoice_number) {
    const err = new Error('NO_INVOICE');
    err.code = 'NO_INVOICE';
    throw err;
  }
  const model = buildInvoiceModel(reservation, clientUser, room, extraDocs);
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
