
const express = require('express');
const session = require('express-session');
const authRoutes = require('./routes/authRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes')
const dbConnection = require('./db');
const path = require('path');
require('dotenv').config();

const app = express();

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

dbConnection();

// Rutas
app.use('/auth', authRoutes);
app.use('/reservation',reservationRoutes)
app.use('/user',userRoutes);
app.use('/room',roomRoutes) //RUTAS DEFINIDAS Y FUNCIONALES, FALTAN DEFINIR BIEN ROLES

//Multer para subida de imagenes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en ${PORT}`);
});
