/**
 * Una sola vez: quita invoice_number=null explícito y reemplaza el índice único antiguo
 * (sparse + null = solo un documento sin factura permitido) por índice único parcial
 * (solo strings = nº de factura ya emitido).
 *
 * Uso: desde la carpeta API con .env cargado:
 *   node scripts/fix-reservation-invoice-index.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('Falta MONGO_URI en .env');
    process.exit(1);
  }
  await mongoose.connect(uri, { family: 4 });
  const col = mongoose.connection.collection('reservations');

  const rUnset = await col.updateMany(
    { $or: [{ invoice_number: null }, { invoice_number: '' }] },
    { $unset: { invoice_number: '' } },
  );
  console.log('updateMany $unset invoice_number null/vacío:', rUnset.modifiedCount, 'documentos');

  try {
    await col.dropIndex('invoice_number_1');
    console.log('Índice antiguo invoice_number_1 eliminado.');
  } catch (e) {
    console.log('dropIndex invoice_number_1:', e.message);
  }

  await col.createIndex(
    { invoice_number: 1 },
    {
      name: 'invoice_number_1',
      unique: true,
      partialFilterExpression: { invoice_number: { $type: 'string' } },
    },
  );
  console.log('Índice único parcial invoice_number_1 creado (solo type string).');

  await mongoose.disconnect();
  console.log('Listo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
