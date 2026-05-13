/* =====================================================
   ============= CONTROLLER DE HABITACION ==============
   ===================================================== */

const Room = require('../models/Room');
const Reservation = require('../models/Reservation');

const DEFAULT_IMG =
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=2069&auto=format&fit=crop';

function collectImageUrls(room) {
  const fromArr = Array.isArray(room.images) ? room.images.filter(Boolean).map(String) : [];
  const fromLegacy = room.image
    ? String(room.image)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const merged = [...fromArr];
  for (const u of fromLegacy) {
    if (!merged.includes(u)) merged.push(u);
  }
  return merged;
}

function effectiveNightly(room) {
  const base = Number(room.price_per_night) || 0;
  const pct = Number(room.offer_percent) || 0;
  if (room.offer_active && pct > 0 && pct <= 100) {
    return Math.round(base * (1 - pct / 100) * 100) / 100;
  }
  return base;
}

/** Salida JSON unificada para app (imágenes, oferta, flags cliente). */
function normalizeRoomOut(room, occupiedNowSet) {
  const imgs = collectImageUrls(room);
  const imageStr = imgs.length ? imgs.join(',') : (room.image || DEFAULT_IMG);
  const base = Number(room.price_per_night) || 0;
  const eff = effectiveNightly({ ...room, price_per_night: base });
  return {
    ...room,
    images: imgs,
    image: imageStr,
    extra_services: Array.isArray(room.extra_services) ? room.extra_services.map(String) : [],
    is_operational: room.isOperational !== false,
    is_occupied_now: occupiedNowSet
      ? occupiedNowSet.has(String(room.room_id).trim())
      : false,
    effective_price_per_night: eff,
    base_price_per_night: base,
  };
}

async function getRoom(req, res) {
  try {
    const room_id =
      req.query?.id ||
      req.query?.room_id ||
      (typeof req.body?.room_id === 'string' ? req.body.room_id : null);
    if (!room_id) {
      return res.status(400).json({ error: 'Falta room_id (query ?id= o ?room_id= o body.room_id)' });
    }
    const room = await Room.findOne({ room_id: String(room_id).trim() }).lean();
    if (!room) return res.status(404).json({ error: 'Habitacion no encontrada' });
    const now = new Date();
    const overlapping = await Reservation.find({
      cancelation_date: null,
      check_in: { $lte: now },
      check_out: { $gt: now },
    })
      .select('room_id')
      .lean();
    const occupiedSet = new Set(overlapping.map((r) => String(r.room_id).trim()));
    return res.json(normalizeRoomOut(room, occupiedSet));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la habitacion', detalle: err.message });
  }
}

async function getAllRooms(req, res) {
  try {
    const now = new Date();
    const overlapping = await Reservation.find({
      cancelation_date: null,
      check_in: { $lte: now },
      check_out: { $gt: now },
    })
      .select('room_id')
      .lean();
    const occupiedSet = new Set(overlapping.map((r) => String(r.room_id).trim()));

    let rooms = await Room.find().lean();
    rooms = rooms.map((room) => normalizeRoomOut(room, occupiedSet));
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar las reservas', detalle: err.message });
  }
}

async function createRoom(req, res) {
  try {
    console.log('BODY CREATE:', req.body);

    const {
      room_id,
      type,
      description,
      image,
      images,
      extra_services,
      offer_active,
      offer_percent,
      price_per_night,
      rate,
      max_occupancy,
      isOperational,
    } = req.body;

    if (!room_id || !type || !description || price_per_night === undefined || max_occupancy === undefined) {
      return res.status(400).json({
        message: 'Faltan campos obligatorios',
        received: req.body,
      });
    }

    const normalizedType = String(type).trim();
    let imgList = [];
    if (Array.isArray(images)) {
      imgList = images.map((s) => String(s).trim()).filter(Boolean);
    }
    let normalizedImage = image ? String(image).trim() : '';
    if (!normalizedImage && imgList.length) normalizedImage = imgList.join(',');
    if (!normalizedImage) {
      if (normalizedType === 'Individual') {
        normalizedImage =
          'https://tse4.mm.bing.net/th/id/OIP.X32afwtV0tN6vSo4lgs2agHaE8?rs=1&pid=ImgDetMain';
      } else if (normalizedType === 'Doble') {
        normalizedImage =
          'https://tse1.mm.bing.net/th/id/OIP.6WkIi7teiTfbXuocSg4vTQHaEc?rs=1&pid=ImgDetMain';
      } else if (normalizedType === 'Suite') {
        normalizedImage =
          'https://tse1.mm.bing.net/th/id/OIP.DSZNYXrN85ABgV-13uSSKgHaEK?rs=1&pid=ImgDetMain';
      }
    }
    if (!imgList.length && normalizedImage) {
      imgList = normalizedImage.split(',').map((s) => s.trim()).filter(Boolean);
    }

    const extraList = Array.isArray(extra_services)
      ? extra_services.map((s) => String(s).trim()).filter(Boolean)
      : [];

    const data = {
      room_id: String(room_id).trim(),
      type: normalizedType,
      description: String(description).trim(),
      image: normalizedImage,
      images: imgList,
      extra_services: extraList,
      offer_active: offer_active !== undefined ? Boolean(offer_active) : false,
      offer_percent:
        offer_percent !== undefined ? Math.min(100, Math.max(0, Number(offer_percent))) : 0,
      price_per_night: Number(price_per_night),
      rate: rate !== undefined ? Number(rate) : 0,
      max_occupancy: parseInt(max_occupancy, 10),
      isOperational: isOperational !== undefined ? Boolean(isOperational) : true,
      isAvailable: true,
    };

    if (isNaN(data.price_per_night)) return res.status(400).json({ message: 'price_per_night inválido' });
    if (isNaN(data.rate)) return res.status(400).json({ message: 'rate inválido' });
    if (isNaN(data.max_occupancy)) return res.status(400).json({ message: 'max_occupancy inválido' });

    const allowedTypes = ['Individual', 'Doble', 'Suite'];
    if (!allowedTypes.includes(data.type)) {
      return res.status(400).json({
        message: `type inválido. Usa: ${allowedTypes.join(', ')}`,
      });
    }

    const roomExists = await Room.findOne({ room_id: data.room_id });
    if (roomExists) {
      return res.status(409).json({
        message: `La habitación ${data.room_id} ya existe`,
      });
    }

    const newRoom = new Room(data);
    try {
      await newRoom.validate();
    } catch (valError) {
      return res.status(400).json({
        message: 'Error de validación de datos',
        errors: valError.errors,
      });
    }

    await newRoom.save();

    res.status(201).json({
      message: 'Habitación creada correctamente',
      room: newRoom,
    });
  } catch (error) {
    console.error('CREATE ERROR FULL:', error);
    res.status(500).json({
      error: 'Error interno al crear la habitación',
      detalle: error.message,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    });
  }
}

async function deleteRoom(req, res) {
  try {
    const { room_id } = req.body;

    if (!room_id) {
      return res.status(400).json({
        message: 'El room_id es obligatorio',
      });
    }

    const deletedRoom = await Room.findOneAndDelete({ room_id });

    if (!deletedRoom) {
      return res.status(404).json({
        message: 'Habitación no encontrada',
      });
    }

    res.json({
      message: 'Habitación eliminada correctamente',
      room: deletedRoom,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al eliminar la habitación',
      detalle: error.message,
    });
  }
}

async function getAvailableRooms(req, res) {
  try {
    const qIn = req.query.checkIn || req.query.check_in;
    const qOut = req.query.checkOut || req.query.check_out;
    const guestsRaw = req.query.guests ?? req.query.Guests ?? 1;
    const guests = Math.max(1, Number(guestsRaw) || 1);
    const servicesRaw = req.query.services || req.query.service_ids || '';

    if (!qIn || !qOut) {
      return res.status(400).json({ error: 'Faltan checkIn/checkOut (o check_in/check_out)' });
    }

    const ci = parseYMD(qIn);
    const co = parseYMD(qOut);

    if (isNaN(ci.getTime()) || isNaN(co.getTime())) {
      return res.status(400).json({ error: 'Formato de fecha inválido (usa YYYY-MM-DD o DD/MM/YYYY)' });
    }
    if (ci >= co) {
      return res.status(400).json({ error: 'checkIn debe ser anterior a checkOut' });
    }

    const overlappingReservations = await Reservation.find({
      cancelation_date: null,
      check_in: { $lt: co },
      check_out: { $gt: ci },
    }).select({ room_id: 1, _id: 0 });

    const occupiedIds = overlappingReservations
      .map((r) => String(r.room_id).trim())
      .filter(Boolean);

    let available = await Room.find({
      isOperational: { $ne: false },
      max_occupancy: { $gte: guests },
      room_id: { $nin: occupiedIds },
    }).lean();

    const requiredServices = String(servicesRaw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (requiredServices.length) {
      available = available.filter((room) => {
        const have = Array.isArray(room.extra_services) ? room.extra_services.map(String) : [];
        return requiredServices.every((id) => have.includes(id));
      });
    }

    const now = new Date();
    const overlappingNow = await Reservation.find({
      cancelation_date: null,
      check_in: { $lte: now },
      check_out: { $gt: now },
    })
      .select('room_id')
      .lean();
    const occupiedNowSet = new Set(overlappingNow.map((r) => String(r.room_id).trim()));

    const out = available.map((room) => normalizeRoomOut(room, occupiedNowSet));
    return res.json(out);
  } catch (err) {
    console.error('❌ getAvailableRooms ERROR:', err);
    return res.status(500).json({ error: 'Error buscando disponibilidad', detail: err.message });
  }
}

function parseYMD(s) {
  const t = String(s).trim().replace(/\//g, '-');
  const parts = t.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date(NaN);
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

async function updateRoom(req, res) {
  try {
    console.log('BODY UPDATE:', req.body);

    const { room_id } = req.body;
    if (!room_id) return res.status(400).json({ message: 'room_id obligatorio' });

    const data = {
      type: req.body.type,
      description: req.body.description,
      image: req.body.image,
      images: req.body.images,
      extra_services: req.body.extra_services,
      offer_active: req.body.offer_active,
      offer_percent: req.body.offer_percent,
      price_per_night: req.body.price_per_night,
      rate: req.body.rate,
      max_occupancy: req.body.max_occupancy,
      isOperational: req.body.isOperational,
    };

    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    if (data.type) data.type = String(data.type).trim();
    if (data.description) data.description = String(data.description).trim();
    if (data.image) data.image = String(data.image).trim();

    if (Array.isArray(data.images)) {
      data.images = data.images.map((s) => String(s).trim()).filter(Boolean);
      if (data.images.length && !data.image) data.image = data.images.join(',');
    }
    if (Array.isArray(data.extra_services)) {
      data.extra_services = data.extra_services.map((s) => String(s).trim()).filter(Boolean);
    }
    if (data.offer_active !== undefined) data.offer_active = Boolean(data.offer_active);
    if (data.offer_percent !== undefined) {
      data.offer_percent = Math.min(100, Math.max(0, Number(data.offer_percent)));
    }

    const allowedTypes = ['Individual', 'Doble', 'Suite'];
    if (data.type && !allowedTypes.includes(data.type)) {
      return res.status(400).json({ message: `type inválido. Usa: ${allowedTypes.join(', ')}` });
    }

    if (data.price_per_night !== undefined) data.price_per_night = Number(data.price_per_night);
    if (data.rate !== undefined) data.rate = Number(data.rate);

    if (data.max_occupancy !== undefined) {
      data.max_occupancy = parseInt(data.max_occupancy, 10);
    }

    if (data.isOperational !== undefined) data.isOperational = Boolean(data.isOperational);

    const updated = await Room.findOneAndUpdate(
      { room_id: String(room_id).trim() },
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: 'Habitación no encontrada' });

    const now = new Date();
    const overlapping = await Reservation.find({
      cancelation_date: null,
      check_in: { $lte: now },
      check_out: { $gt: now },
    })
      .select('room_id')
      .lean();
    const occupiedSet = new Set(overlapping.map((r) => String(r.room_id).trim()));

    return res.json({
      message: 'Habitación actualizada',
      room: normalizeRoomOut(updated.toObject ? updated.toObject() : updated, occupiedSet),
    });
  } catch (error) {
    console.error('UPDATE ERROR FULL:', JSON.stringify(error, null, 2));
    return res.status(500).json({ error: 'Error al actualizar', detalle: error.message });
  }
}

module.exports = {
  getAllRooms,
  getRoom,
  createRoom,
  deleteRoom,
  getAvailableRooms,
  updateRoom,
};
