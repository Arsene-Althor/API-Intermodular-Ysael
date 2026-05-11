const Review = require("../models/Review");
const Reservation = require("../models/Reservation");
const User = require("../models/User");

// Siguiente REV-xxxxx usando solo la colección reviews (sin colección counters)
async function nextReviewId() {
  const last = await Review.findOne()
    .sort({ review_id: -1 })
    .select("review_id")
    .lean();
  let n = 0;
  if (last && last.review_id && /^REV-[0-9]{5}$/.test(last.review_id)) {
    n = parseInt(last.review_id.split("-")[1], 10);
  }
  return `REV-${String(n + 1).padStart(5, "0")}`;
}

async function getMyReviews(req, res) {
  try {
    const user_id = req.user.user_id;
    const list = await Review.find({ user_id }).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Error al listar tus reseñas", detalle: err.message });
  }
}

async function getReviewsByRoom(req, res) {
  try {
    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ error: "Falta roomId" });
    }
    const list = await Review.find({ room_id: roomId }).sort({
      createdAt: -1,
    });
    res.json(list);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Error al listar reseñas", detalle: err.message });
  }
}

async function createReview(req, res) {
  try {
    const { room_id, rating, comment } = req.body;
    const user_id = req.user.user_id;

    if (!room_id || rating === undefined || !comment) {
      return res.status(400).json({ error: "Faltan room_id, rating o comment" });
    }

    const ratingNum = Number.parseInt(String(rating), 10);
    if (Number.isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: "La puntuación debe ser entre 1 y 5" });
    }

    const hasBooking = await Reservation.findOne({
      user_id,
      room_id,
    });

    if (!hasBooking) {
      return res.status(403).json({
        error:
          "Solo pueden reseñar usuarios que hayan reservado esa habitación",
      });
    }

    const existing = await Review.findOne({ user_id, room_id });
    if (existing) {
      return res.status(400).json({ error: "Ya tienes una reseña en esta habitación" });
    }

    const user = await User.findOne({ user_id }).select("name surname");
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const user_name = `${user.name} ${user.surname}`.trim();
    const review_id = await nextReviewId();

    await Review.create({
      review_id,
      room_id,
      user_id,
      user_name,
      rating: ratingNum,
      comment: String(comment).trim(),
    });

    res.status(201).json({ message: "Reseña creada" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Ya existe una reseña para esta habitación" });
    }
    res.status(500).json({ error: "Error al crear reseña", detalle: err.message });
  }
}

async function deleteReview(req, res) {
  try {
    const { review_id } = req.body;
    if (!review_id) {
      return res.status(400).json({ error: "Falta review_id" });
    }

    const review = await Review.findOne({ review_id });
    if (!review) {
      return res.status(404).json({ error: "Reseña no encontrada" });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner = req.user.user_id === review.user_id;
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: "No puedes borrar esta reseña" });
    }

    await Review.deleteOne({ review_id });
    res.json({ message: "Reseña eliminada" });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar reseña", detalle: err.message });
  }
}

module.exports = {
  getMyReviews,
  getReviewsByRoom,
  createReview,
  deleteReview,
};
