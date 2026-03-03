/* =====================================================
   ============= CONTROLLER DE HABITACION ==============
   =====================================================

   Este bloque se utiliza para:
    -getRoom: se tendra que poner la room_id por body y buscara la habitacion | route.get(http://localhost:3000/room/one)
    -getAllRooms: no ha hace falta poner nada en body simplemente bien la ruta | route.get(http://localhost:3000/room/all)
    -createRoom: se tendra que poner todas las especificaciones de una habitacion para crearla | route.post (http://localhost:3000/room/create)
    -deleteRoom: se tendra que poner la room_id por body y elimina la habitacion | route.delete(http://localhost:3000/room/delete)

   ===================================================== */


/* =====================================================
              CONTROLES PARA HABITACION
   ===================================================== */
const Room = require('../models/Room')
const mongoose = require('mongoose');
const Reservation = require("../models/Reservation");

/* =====================================================
              OBTENER HABITACION POR ID
   ===================================================== */

async function getRoom(req, res) {
  try {
    const { room_id } = req.body;
    const room = await Room.findOne({ room_id }).lean();
    if (!room) return res.status(404).json({ error: 'Habitacion no encontrada' });
    if (!room.image) room.image = 'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=2069&auto=format&fit=crop';
    res.json(room);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la habitacion', detalle: err.message });
  }
}

/* =====================================================
              OBTENER TODAS LAS HABITACIONES
   ===================================================== */

async function getAllRooms(req, res) {
  try {
    let rooms = await Room.find().lean();
    rooms = rooms.map(room => ({
      ...room,
      image: room.image || 'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=2069&auto=format&fit=crop'
    }));
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar las reservas', detalle: err.message });
  }
}

/* =====================================================
              CREAR UNA NUEVA HABITACIÓN
   ===================================================== */

async function createRoom(req, res) {
  try {
    console.log("BODY CREATE:", req.body);

    const {
      room_id,
      type,
      description,
      image,
      price_per_night,
      rate,
      max_occupancy,
      isAvailable
    } = req.body;

    // 1. Validar campos obligatorios (permitiendo valor 0 en numéricos)
    if (
      !room_id ||
      !type ||
      !description ||
      // image ya no es obligatorio aqui, se asigna default si est vacio
      price_per_night === undefined ||
      max_occupancy === undefined
    ) {
      return res.status(400).json({
        message: "Faltan campos obligatorios",
        received: req.body
      });
    }

    // 2. Normalización de datos
    const normalizedType = String(type).trim();
    let normalizedImage = image ? String(image).trim() : "";

    // Asignar imagen por defecto si no existe
    if (!normalizedImage) {
      if (normalizedType === "Individual") {
        normalizedImage = "https://tse4.mm.bing.net/th/id/OIP.X32afwtV0tN6vSo4lgs2agHaE8?rs=1&pid=ImgDetMain";
      } else if (normalizedType === "Doble") {
        normalizedImage = "https://tse1.mm.bing.net/th/id/OIP.6WkIi7teiTfbXuocSg4vTQHaEc?rs=1&pid=ImgDetMain";
      } else if (normalizedType === "Suite") {
        normalizedImage = "https://tse1.mm.bing.net/th/id/OIP.DSZNYXrN85ABgV-13uSSKgHaEK?rs=1&pid=ImgDetMain";
      }
    }

    const data = {
      room_id: String(room_id).trim(),
      type: normalizedType,
      description: String(description).trim(),
      image: normalizedImage,
      price_per_night: Number(price_per_night),
      rate: rate !== undefined ? Number(rate) : 0,
      max_occupancy: parseInt(max_occupancy, 10),
      isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true
    };

    // 2.1 Verificar NaNs (Extra safety)
    if (isNaN(data.price_per_night)) return res.status(400).json({ message: "price_per_night inválido" });
    if (isNaN(data.rate)) return res.status(400).json({ message: "rate inválido" });
    if (isNaN(data.max_occupancy)) return res.status(400).json({ message: "max_occupancy inválido" });

    // 3. Validar Enum de tipo
    const allowedTypes = ["Individual", "Doble", "Suite"];
    if (!allowedTypes.includes(data.type)) {
      return res.status(400).json({
        message: `type inválido. Usa: ${allowedTypes.join(", ")}`
      });
    }

    // 4. Comprobamos si la habitación ya existe
    const roomExists = await Room.findOne({ room_id: data.room_id });
    if (roomExists) {
      return res.status(409).json({
        message: `La habitación ${data.room_id} ya existe`
      });
    }

    // 5. Instanciar y Validar explícitamente para ver errores
    const newRoom = new Room(data);
    try {
      await newRoom.validate();
    } catch (valError) {
      // Si falla validación de Mongoose, devolvemos los detalles
      return res.status(400).json({
        message: "Error de validación de datos",
        errors: valError.errors
      });
    }

    // 6. Guardar
    await newRoom.save();

    // 7. Respuesta correcta
    res.status(201).json({
      message: "Habitación creada correctamente",
      room: newRoom
    });

  } catch (error) {
    console.error("CREATE ERROR FULL:", error);
    res.status(500).json({
      error: "Error interno al crear la habitación",
      detalle: error.message,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
    });
  }
};


/* =====================================================
              ELIMINAR UNA NUEVA HABITACIÓN
   ===================================================== */

async function deleteRoom(req, res) {
  try {
    const { room_id } = req.body;

    // Validamos que llegue el room_id
    if (!room_id) {
      return res.status(400).json({
        message: "El room_id es obligatorio"
      });
    }

    // Buscamos y eliminamos la habitación
    const deletedRoom = await Room.findOneAndDelete({ room_id });

    // Si no existe
    if (!deletedRoom) {
      return res.status(404).json({
        message: "Habitación no encontrada"
      });
    }

    // Respuesta correcta
    res.json({
      message: "Habitación eliminada correctamente",
      room: deletedRoom
    });
  } catch (error) {
    res.status(500).json({
      error: "Error al eliminar la habitación",
      detalle: error.message
    });
  }
};
/* =====================================================
          HABITACIONES DISPONIBLES POR FECHA
   ===================================================== */

async function getAvailableRooms(req, res) {
  try {
    console.log("QUERY RAW:", req.query); //prueba

    const { checkIn, checkOut, guests = 1 } = req.query;

    if (!checkIn || !checkOut) {
      return res.status(400).json({ error: "Faltan checkIn o checkOut" });
    }

    const ci = parseYMD(checkIn);
    const co = parseYMD(checkOut);

    console.log("PARSED ci/co:", ci.toISOString(), co.toISOString()); //prueba

    if (isNaN(ci.getTime()) || isNaN(co.getTime())) {
      return res.status(400).json({ error: "Formato de fecha inválido (usa YYYY-MM-DD)" });
    }
    if (ci >= co) {
      return res.status(400).json({ error: "checkIn debe ser anterior a checkOut" });
    }

    // Reservas solapadas NO canceladas (campo real: cancelation_date)
    const overlappingReservations = await Reservation.find({
      cancelation_date: null,
      check_in: { $lt: co },
      check_out: { $gt: ci }
    }).select({ room_id: 1, _id: 0 });

    const occupiedIds = overlappingReservations.map(r => String(r.room_id).trim());

    const available = await Room.find({
      max_occupancy: { $gte: Number(guests) },
      room_id: { $nin: occupiedIds }
    }).lean();

    const availableWithImage = available.map(room => ({
      ...room,
      image: room.image || 'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=2069&auto=format&fit=crop'
    }));

    return res.json(availableWithImage);
  } catch (err) {
    console.error("❌ getAvailableRooms ERROR:", err);
    return res.status(500).json({ error: "Error buscando disponibilidad", detail: err.message });
  }
}

function parseYMD(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)); // UTC 00:00
}

/* =====================================================
                  MODIFICAR HABITACIÓN
   ===================================================== */

async function updateRoom(req, res) {
  try {
    console.log("BODY UPDATE:", req.body);

    const { room_id } = req.body;
    if (!room_id) return res.status(400).json({ message: "room_id obligatorio" });

    // Whitelist (porque additionalProperties:false)
    const data = {
      type: req.body.type,
      description: req.body.description,
      image: req.body.image,
      price_per_night: req.body.price_per_night,
      rate: req.body.rate,
      max_occupancy: req.body.max_occupancy,
      isAvailable: req.body.isAvailable,
    };

    // Limpia undefined
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

    // Normaliza strings
    if (data.type) data.type = String(data.type).trim();
    if (data.description) data.description = String(data.description).trim();
    if (data.image) data.image = String(data.image).trim();

    // Enum estricto
    const allowedTypes = ["Individual", "Doble", "Suite"];
    if (data.type && !allowedTypes.includes(data.type)) {
      return res.status(400).json({ message: `type inválido. Usa: ${allowedTypes.join(", ")}` });
    }

    // Tipos (IMPORTANTE)
    if (data.price_per_night !== undefined) data.price_per_night = Number(data.price_per_night);
    if (data.rate !== undefined) data.rate = Number(data.rate);

    if (data.max_occupancy !== undefined) {
      data.max_occupancy = parseInt(data.max_occupancy, 10); // 👈 int sí o sí
    }

    if (data.isAvailable !== undefined) data.isAvailable = Boolean(data.isAvailable);

    const updated = await Room.findOneAndUpdate(
      { room_id: String(room_id).trim() },
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Habitación no encontrada" });

    return res.json({ message: "Habitación actualizada", room: updated });

  } catch (error) {
    console.error("UPDATE ERROR FULL:", JSON.stringify(error, null, 2));
    return res.status(500).json({ error: "Error al actualizar", detalle: error.message });
  }
}

module.exports = {
  getAllRooms,
  getRoom,
  createRoom,
  deleteRoom,
  getAvailableRooms,
  updateRoom
}