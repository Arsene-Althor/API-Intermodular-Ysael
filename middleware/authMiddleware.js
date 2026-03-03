// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

function requireLogin(req, res, next) {
  const authHeader = req.headers['authorization'];

  //Extraer token del header "Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];

  if(!token) {
    return res.status(401).json({ error: 'Acceso denegado. token no proporcionado.' });
  }

  try{
    //Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; //Guarda datos del usuario en req
    next();

  }catch(error){
    if (error.name === 'TokenExpiredError'){
      return res.status(403).json({
        error: 'Token expirado'
      });
    }

    return res.status(403).json({
    error: 'Token inválido'
    });
  }
}

/**
 * Middleware para validar que el usuario tiene un role específico
 * Uso: router.patch('/modif/:userId', requireLogin, requireRole('admin'), modifyUser);
 */
function requireRole(requiredRoles){
  return (req, res, next) => {
    //req.user viene del middleware requireLogin
    const allowedroles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
    if(!allowedroles.includes(req.user.role)){
      return res.status(403).json({
        error: `No tienes permisos. Se requiere role: ${allowedroles}`
      });
    }

    next();
  };
}

function requireOwnerOrAdmin(req, res, next){

  if (!req.user){
    return res.status(401).json({
      error: 'Usuario no autenticado'
    });
  }

  const {userId} = req.params; //user_id de la url

  //Si es admin, permitir
  if (req.user.role === 'admin'){
    next();
    return;
  }

  //Si no es admin, verificar que sea el propietario
  if (req.user.user_id !== userId){
    return res.status(403).json({
      error: 'Solo puedes modificar tu propia cuenta'
    });
  }

  next();
}

module.exports = { requireLogin, requireRole, requireOwnerOrAdmin };
