//routes/authRoutes.js
const express = require("express");
const router = express.Router();
const {
  registroUser,
  addEmployee,
  getAllUsers,
  removeUsers,
  modifyUser,
  updateDiscount,
} = require("../controllers/userController.js");
const {
  requireLogin,
  requireRole,
  requireOwnerOrAdmin,
} = require("../middleware/authMiddleware.js");
const upload = require("../middleware/diskStorage.js");

//Middleware para manejar errores de Multer
const handleMulterError = (req, res, next) => {
    upload.single('profileImage')(req, res, (err) => {
    if (err) {
      console.error("Error de Multer:", err);
      return res
        .status(400)
        .json({ error: "Error al subir imagen: " + err.message });
    }
    next();
  });
};

//Ruta publica, no necesita autenticar
//upload.sigle('profileImage') = Busca un archivo en el campo llamado 'profileImage'
router.post('/register', handleMulterError, registroUser);

//Protegidas (requiere que se logueen)
router.post(
  "/add",
  requireLogin,
  requireRole(["employee", "admin", "client"]),
  handleMulterError,
  addEmployee,
); //POST /api/users/add (solo admin)

router.get('/get', requireLogin, getAllUsers); //GET /api/users/get (solo usuarios logueados)

router.patch(
  "/modify/:userId",
  requireLogin,
  requireOwnerOrAdmin,
  handleMulterError,
  modifyUser,
); // PATCH /api/users/modif/:userId

router.delete(
  "/remove/:userId",
  requireLogin,
  requireRole(["admin", "employee"]),
  removeUsers,
); // DELETE /api/users/remove/:userId

router.patch(
  "/update/:userId",
  requireLogin,
  requireRole(["admin", "employee"]),
  updateDiscount,
); // PATCH /api/users/update/:userId

module.exports = router;
