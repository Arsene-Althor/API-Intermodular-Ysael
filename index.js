require('dotenv').config();

const express = require('express');
const session = require('express-session');
const authRoutes = require('./routes/authRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const loyaltyRoutes = require('./routes/loyaltyRoutes');
const usersRoutes = require('./routes/usersRoutes');
const dbConnection = require('./db');
const path = require('path');
const { requireLogin, requireRole } = require('./middleware/authMiddleware');
const auditController = require('./controllers/auditController');

const app = express();

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

dbConnection();

// Rutas
app.use('/auth', authRoutes);
// Explícito antes del router: evita 404 si el despliegue no monta bien las rutas del sub-router.
app.get(
  '/reservation/audits',
  requireLogin,
  requireRole(['admin', 'employee']),
  auditController.listAuditLogs,
);
app.use('/reservation', reservationRoutes);
app.use('/bookings', bookingRoutes);
app.use('/user',userRoutes);
app.use('/users', usersRoutes);
app.use('/room', roomRoutes); // RUTAS DEFINIDAS Y FUNCIONALES, FALTAN DEFINIR BIEN ROLES
app.use('/review', reviewRoutes);
app.use('/invoices', invoiceRoutes);
app.use('/settings', settingsRoutes);
app.use('/loyalty', loyaltyRoutes);

//Multer para subida de imagenes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Puerto (.env PORT; si falta, 3000)
const PORT = process.env.PORT || 3000;
// 0.0.0.0: acepta conexiones desde emulador Android (10.0.2.2) y LAN, no solo localhost.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en ${PORT} (todas las interfaces)`);
});
