/* =====================================================
   ============= ROUTES DE HABITACION ==================
   =====================================================

   Este bloque se utiliza para:
   -router.get(/all, roomController.getAllRooms): (OBTENER TODAS LAS HABITACIONES) esta llamara a la funcion getAllRooms que esta en el controller y sera para 
   -router.get('/one', roomController.getRoom): (OBTENER UNA HABITACION POR BODY) esta llamara a la funcion getRoom que esta en el controller
                                                   y por el body se le enviara una room_id para que te salga esa habitacion
   -router.post('/create', roomController.createRoom): (CREAR UNA HABITACION POR BODY)esta llamara a la funcion createRoom que esta en el controller
                                                   y por el body se le enviara una TODAS las propiedades para crear esa habitacion
   -router.delete('/delete', roomController.deleteRoom): (ELIMINAR UNA HABITACION POR BODY) esta llamara a la funcion deleteRoom que esta en el controller
                                                   y por el body se le enviara una room_id para que te salga esa habitacion
                                                   

   ===================================================== */

// Rutas para habitaciones (Room)
const express = require('express')
const router = express.Router();
const roomController = require('../controllers/roomController')

// Faltan agregar roles de quien puede acceder a las llamadas

router.get('/all', roomController.getAllRooms)
router.get('/one', roomController.getRoom) 
router.post('/create', roomController.createRoom)
router.delete('/delete', roomController.deleteRoom)
router.get("/available", roomController.getAvailableRooms)
router.put("/update", roomController.updateRoom);

module.exports = router;