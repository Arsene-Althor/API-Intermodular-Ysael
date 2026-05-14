require('dotenv').config();

const express = require('express');
const session = require('express-session');
const authRoutes = require('./routes/authRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const dbConnection = require('./db');
const path = require('path');

const app = express();

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

dbConnection();

// Rutas
app.use('/auth', authRoutes);
app.use('/reservation',reservationRoutes)
app.use('/user',userRoutes);
app.use('/room', roomRoutes); // RUTAS DEFINIDAS Y FUNCIONALES, FALTAN DEFINIR BIEN ROLES
app.use('/review', reviewRoutes);
app.use('/invoices', invoiceRoutes);

//Multer para subida de imagenes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Puerto (.env PORT; si falta, 3000)
const PORT = process.env.PORT || 3000;
// 0.0.0.0: acepta conexiones desde emulador Android (10.0.2.2) y LAN, no solo localhost.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en ${PORT} (todas las interfaces)`);
});
