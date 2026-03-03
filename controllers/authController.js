// controllers/authController.js
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/**
 * Login del usuario
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password){
      return res.status(400).json({
        error: 'Email y contraseña son obligatorios'
      });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user){
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const esCorrecta = await bcrypt.compare(password, user.password);

    if (!esCorrecta) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    //Validamos si el usuario esta activo
    if (!user.isActive){
      return res.status(403).json({
        error: 'Usuario desactivado'
      });
    }

    const token = jwt.sign(
      { user_id: user.user_id,
        email: user.email,
        role: user.role,
        isVIP: user.isVIP
      },
      process.env.JWT_SECRET, 
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      mensaje: '¡Bienvenido!',
      token: token,
      user: {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        role: user.role,
        profileImage: user.profileImage,
        isVIP: user.isVIP,
        discount: user.discount,
        dni: user.dni,
        birthDate: user.birthDate,
        gender: user.gender,
        city: user.city,
        isActive: user.isActive
      }
    });

  } catch (err) {
    res.status(500).json({ error: 'Error en login', detalle: err.message });
  }
}

async function logout(req, res) {
  try {
    // Con JWT el servidor no mantiene una sesión activa.
    // El "logout" real consiste en que la aplicación cliente (Android/WPF)
    // elimine el token que tiene guardado.
    return res.status(200).json({ 
      message: 'Sesión cerrada correctamente. Recuerda eliminar el token en la aplicación cliente.' 
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar el cierre de sesión', detalle: err.message });
  }
}

module.exports = { login, logout};