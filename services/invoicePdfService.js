/**
 * Modelo de factura + generación PDF (pdfkit) para GET /reservation/:id/invoice
 */
const PDFDocument = require('pdfkit');
const { computeInvoiceBreakdown } = require('./invoiceBreakdownService');
const { getMergedHotelInvoiceDisplay } = require('./invoiceSettingsService');

function resolveBreakdown(reservation, clientUser, room, extraDocs) {
  if (reservation.invoice_breakdown && typeof reservation.invoice_breakdown === 'object') {
    return reservation.invoice_breakdown;
  }
  return computeInvoiceBreakdown(reservation, clientUser, room, extraDocs || []);
}

async function buildInvoiceModel(reservation, clientUser, room, extraDocs, hotelInvoice) {
  const hotelBlock = await getMergedHotelInvoiceDisplay();
  const IVA_RATE = hotelBlock.iva_rate;
  const totalTTC = hotelInvoice ? Number(hotelInvoice.amount) : Number(reservation.price) || 0;
  const base = Math.round((totalTTC / (1 + IVA_RATE)) * 100) / 100;
  const iva = Math.round((totalTTC - base) * 100) / 100;
  const bd =
    hotelInvoice?.invoice_breakdown && typeof hotelInvoice.invoice_breakdown === 'object'
      ? hotelInvoice.invoice_breakdown
      : resolveBreakdown(reservation, clientUser, room, extraDocs);

  return {
    invoice_number: hotelInvoice?.invoice_number || reservation.invoice_number,
    hotel: {
      name: hotelBlock.name,
      address: hotelBlock.address,
      cif: hotelBlock.cif,
      fiscal_notes: hotelBlock.fiscal_notes || '',
    },
    client: {
      user_id: clientUser?.user_id || reservation.user_id,
      name: clientUser ? `${clientUser.name || ''} ${clientUser.surname || ''}`.trim() : '—',
      email: clientUser?.email || '—',
      dni: clientUser?.dni || '—',
      city: clientUser?.city || '—',
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
    issued_at: hotelInvoice?.issued_at || reservation.booking_paid_at || reservation.checkout_completed_at || new Date(),
    concept: hotelInvoice?.description || bd.concept || 'Estancia hotelera',
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

function roomLabel(roomId) {
  const id = String(roomId || '').trim();
  const m = /^HAB-(\d+)$/i.exec(id);
  return m ? m[1] : id || '—';
}

function buildInvoiceLineItems(m) {
  const bd = m.breakdown;
  const lines = [];
  const hospTotal = bd.client_discount_rate > 0 ? bd.subtotal_after_client_discount : bd.subtotal_hospitality;
  let subLines = `${fmtDate(m.stay.check_in)} – ${fmtDate(m.stay.check_out)}`;
  if (bd.client_discount_rate > 0) {
    subLines += `\nTarifa con descuento (${pctLabel(bd.client_discount_rate)})`;
  } else if (bd.room_offer_active && bd.room_offer_percent > 0) {
    subLines += `\nOferta habitación ${bd.room_offer_percent}%`;
  }
  lines.push({
    concept: `Alojamiento — habitación ${roomLabel(m.stay.room_id)} (${bd.nights} ${bd.nights === 1 ? 'noche' : 'noches'})`,
    detail: subLines,
    qty: 1,
    unit: hospTotal,
    total: hospTotal,
  });
  for (const ex of bd.extras_lines || []) {
    lines.push({
      concept: ex.name || ex.service_id || 'Extra',
      detail: '',
      qty: 1,
      unit: Number(ex.amount) || 0,
      total: Number(ex.amount) || 0,
    });
  }
  if (bd.adjustment_amount && Math.abs(bd.adjustment_amount) >= 0.01) {
    lines.push({
      concept: 'Ajuste reserva',
      detail: 'Diferencia importe pactado',
      qty: 1,
      unit: bd.adjustment_amount,
      total: bd.adjustment_amount,
    });
  }
  return lines;
}

function writeInvoicePdf(doc, m) {
  const left = 50;
  const right = 545;
  const colQty = 355;
  const colUnit = 405;
  const colTotal = 470;
  const wConcept = colQty - left - 10;

  let y = 50;
  doc.fontSize(18).fillColor('#000').font('Helvetica-Bold').text(`Factura ${m.invoice_number}`, left, y);
  y += 26;
  doc.fontSize(10).font('Helvetica').fillColor('#333').text(`Fecha: ${fmtDate(m.issued_at)}`, left, y);
  y += 32;

  const colMid = 300;
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('Emisor', left, y);
  doc.text('Cliente', colMid, y);
  y += 16;
  doc.fontSize(9).font('Helvetica').fillColor('#444');
  doc.text(m.hotel.name, left, y, { width: 230 });
  doc.text(m.client.name, colMid, y, { width: 230 });
  y += 12;
  doc.text(`NIF: ${m.hotel.cif}`, left, y);
  doc.text(`Email: ${m.client.email}`, colMid, y, { width: 230 });
  y += 12;
  doc.text(m.hotel.address, left, y, { width: 230 });
  doc.text(`DNI: ${m.client.dni}`, colMid, y);
  y += 12;
  doc.text('', left, y);
  doc.text(`Ciudad: ${m.client.city || '—'}`, colMid, y);
  y += 22;

  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text('Conceptos facturados', left, y);
  y += 18;
  doc.moveTo(left, y).lineTo(right, y).strokeColor('#999').lineWidth(0.5).stroke();
  y += 8;
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#333');
  doc.text('Concepto', left, y, { width: wConcept });
  doc.text('Cant.', colQty, y, { width: 40, align: 'right' });
  doc.text('P. unit.', colUnit, y, { width: 55, align: 'right' });
  doc.text('Total', colTotal, y, { width: 75, align: 'right' });
  y += 14;
  doc.moveTo(left, y).lineTo(right, y).stroke();
  y += 10;

  const items = buildInvoiceLineItems(m);
  doc.font('Helvetica').fillColor('#444');
  for (const row of items) {
    const rowTop = y;
    doc.fontSize(9).text(row.concept, left, y, { width: wConcept });
    if (row.detail) {
      y = doc.y + 2;
      doc.fontSize(8).fillColor('#666').text(row.detail, left, y, { width: wConcept });
    }
    doc.fontSize(9).fillColor('#444');
    doc.text(String(row.qty), colQty, rowTop, { width: 40, align: 'right' });
    doc.text(`${row.unit.toFixed(2)} EUR`, colUnit, rowTop, { width: 55, align: 'right' });
    doc.text(`${row.total.toFixed(2)} EUR`, colTotal, rowTop, { width: 75, align: 'right' });
    y = Math.max(doc.y, rowTop) + 14;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#ddd').lineWidth(0.3).stroke();
    y += 8;
  }

  y += 12;
  const totalsX = 340;
  doc.fontSize(10).font('Helvetica').fillColor('#333');
  doc.text(`Base imponible: ${m.totals.base.toFixed(2)} EUR`, totalsX, y, { width: 205, align: 'right' });
  y += 14;
  doc.text(`IVA (${(m.totals.iva_rate * 100).toFixed(0)} %): ${m.totals.iva.toFixed(2)} EUR`, totalsX, y, {
    width: 205,
    align: 'right',
  });
  y += 6;
  doc.moveTo(totalsX, y).lineTo(right, y).strokeColor('#000').lineWidth(0.8).stroke();
  y += 10;
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000');
  doc.text(`Total factura: ${m.totals.total.toFixed(2)} EUR`, totalsX, y, { width: 205, align: 'right' });
  y += 28;
  if (m.hotel.fiscal_notes && String(m.hotel.fiscal_notes).trim()) {
    doc.fontSize(8).font('Helvetica').fillColor('#666').text(String(m.hotel.fiscal_notes).trim(), left, y, {
      width: right - left,
    });
    y = doc.y + 8;
  }
  doc.fontSize(8).fillColor('#888').text(
    `Reserva ${m.stay.reservation_id} · ${m.stay.room_id} — ${m.stay.room_type}. Documento generado electrónicamente.`,
    left,
    y,
    { width: right - left },
  );
}

/**
 * PDF de justificante tras el pago simulado en la app (no es factura fiscal).
 */
function writeBookingReceiptPdf(doc, { hotel, client, stay, totalTtc, generatedAt }) {
  doc.fontSize(16).text('JUSTIFICANTE DE RESERVA', { underline: true });
  doc.moveDown(0.35);
  doc.fontSize(9).fillColor('#555').text('Documento no fiscal — acuse de alta de la reserva y pago simulado en la aplicación.', {
    width: 480,
  });
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor('#666').text(
    'La factura con IVA y numeración fiscal se emitirá en recepción al completar el checkout de la estancia.',
    { width: 480 },
  );
  doc.moveDown(1);
  doc.fontSize(10).fillColor('#000');
  doc.text(`Generado: ${fmtDate(generatedAt)}`);
  doc.moveDown(0.75);

  doc.fontSize(11).fillColor('#000').text('Hotel', { underline: true });
  doc.fontSize(10).fillColor('#444');
  doc.text(hotel.name);
  doc.text(`CIF/NIF: ${hotel.cif}`);
  doc.text(`Dirección: ${hotel.address}`);
  doc.moveDown();

  doc.fontSize(11).fillColor('#000').text('Cliente', { underline: true });
  doc.fontSize(10).fillColor('#444');
  doc.text(client.name);
  doc.text(`ID cliente: ${client.user_id}`);
  doc.text(`Email: ${client.email}`);
  doc.text(`DNI/NIF: ${client.dni}`);
  doc.moveDown();

  doc.fontSize(11).fillColor('#000').text('Reserva', { underline: true });
  doc.fontSize(10).fillColor('#444');
  doc.text(`Nº reserva: ${stay.reservation_id}`);
  doc.text(`Habitación: ${stay.room_id} — ${stay.room_type}`);
  doc.text(`Entrada: ${fmtDate(stay.check_in)}    Salida: ${fmtDate(stay.check_out)}`);
  doc.moveDown(0.75);
  doc.fontSize(12).fillColor('#000').text(`Importe total (TTC simulado): ${Number(totalTtc).toFixed(2)} €`);
  doc.moveDown(1);
  doc.fontSize(8).fillColor('#666').text(
    'Pasarela de pago: simulación (sin cargo real a tarjeta). Conserve este PDF como comprobante ante el establecimiento.',
    { width: 480 },
  );
}

async function streamBookingReceiptPdf(res, filename, reservation, clientUser, room) {
  const hotelBlock = await getMergedHotelInvoiceDisplay();
  const safe = String(filename).replace(/[^\w.-]+/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);

  const doc = new PDFDocument({
    margin: 48,
    info: { Title: 'Justificante reserva', Author: hotelBlock.name },
  });
  doc.pipe(res);
  writeBookingReceiptPdf(doc, {
    hotel: {
      name: hotelBlock.name,
      address: hotelBlock.address,
      cif: hotelBlock.cif,
    },
    client: {
      user_id: clientUser?.user_id || reservation.user_id,
      name: clientUser ? `${clientUser.name || ''} ${clientUser.surname || ''}`.trim() : '—',
      email: clientUser?.email || '—',
      dni: clientUser?.dni || '—',
    },
    stay: {
      reservation_id: reservation.reservation_id,
      room_id: reservation.room_id,
      room_type: room?.type || '—',
      check_in: reservation.check_in,
      check_out: reservation.check_out,
    },
    totalTtc: Number(reservation.price) || 0,
    generatedAt: new Date(),
  });
  doc.end();
}

/**
 * Escribe el PDF en la respuesta HTTP (attachment).
 * @param {import('express').Response} res
 * @param {object[]} [extraDocs] — documentos ExtraService lean (ids de la habitación)
 */
async function streamInvoicePdf(res, filename, reservation, clientUser, room, extraDocs, hotelInvoice) {
  const invNum = hotelInvoice?.invoice_number || reservation.invoice_number;
  if (!invNum) {
    const err = new Error('NO_INVOICE');
    err.code = 'NO_INVOICE';
    throw err;
  }
  const model = await buildInvoiceModel(reservation, clientUser, room, extraDocs, hotelInvoice);
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

/**
 * Genera el mismo PDF que GET /invoice, en memoria (p. ej. adjunto en email).
 * @returns {Promise<Buffer>}
 */
function renderInvoicePdfBuffer(reservation, clientUser, room, extraDocs, hotelInvoice) {
  const invNum = hotelInvoice?.invoice_number || reservation.invoice_number;
  if (!invNum) {
    const err = new Error('NO_INVOICE');
    err.code = 'NO_INVOICE';
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    buildInvoiceModel(reservation, clientUser, room, extraDocs, hotelInvoice)
      .then((model) => {
        try {
          const chunks = [];
          const doc = new PDFDocument({
            margin: 48,
            info: { Title: `Factura ${model.invoice_number}`, Author: model.hotel.name },
          });
          doc.on('data', (c) => chunks.push(c));
          doc.on('end', () => resolve(Buffer.concat(chunks)));
          doc.on('error', reject);
          writeInvoicePdf(doc, model);
          doc.end();
        } catch (e) {
          reject(e);
        }
      })
      .catch(reject);
  });
}

module.exports = {
  buildInvoiceModel,
  streamInvoicePdf,
  streamBookingReceiptPdf,
  renderInvoicePdfBuffer,
};
