const mongoose = require('mongoose');
require('dotenv').config();

const dbConnection = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            // Esto obliga a Node a usar IPv4, solucionando el 90% de estos errores en Windows
            family: 4 
        });
        console.log('Conexión exitosa a MongoDB');
        try {
            const Reservation = require('./models/Reservation');
            await Reservation.syncIndexes();
            console.log('Índices Reservation sincronizados.');
        } catch (idxErr) {
            console.warn('Reservation.syncIndexes:', idxErr.message);
            console.warn('Si el fallo es por invoice_number, ejecuta: node scripts/fix-reservation-invoice-index.js');
        }
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error);
        process.exit(1); // Detener la app si no hay conexión
    }
};

module.exports = dbConnection;