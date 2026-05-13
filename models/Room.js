/* =====================================================
   ================== HABITACION =======================
   =====================================================

   Este bloque se utiliza para:
    -room_id: Identificador único, No puede estar vacío, No puede repetirse
    -type: Individual, Doble, Suite
    -description: Información detallada para el usuario de la habitacion
    -image: URL de la imagen
    -price_per_night: Valor numérico del coste de la noche
    -rate: valoracion de la habitacion, Por defecto empieza en 0
    -max_occupancy: Número máximo de personas permitidas
    -isOperational:
        - true  → el hotel puede ofrecer la habitación (empleado)
        - false → fuera de servicio; no aparece en búsqueda cliente
    -isAvailable: (legacy, ya no editable manualmente como "en buen estado")
   ===================================================== */

// Modelo para reservas
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    room_id: {
        type: String,
        required: [true, 'El ID de la reserva es obligatorio'],
        trim: true,
        unique: true
    },
    type: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true,
        default: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=2069&auto=format&fit=crop'
    },
    /** Varias URLs; si hay datos, la API también rellena `image` como join por comas (legacy app). */
    images: {
        type: [String],
        default: []
    },
    /** IDs de servicios extra (p. ej. EXT-001) del catálogo ExtraService. */
    extra_services: {
        type: [String],
        default: []
    },
    offer_active: {
        type: Boolean,
        default: false
    },
    /** Descuento 0–100 sobre price_per_night (precio mostrado = base * (1 - offer_percent/100)). */
    offer_percent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    price_per_night: {
        type: Number,
        required: true
    },
    rate: {
        type: Number,
        default: 0
    },
    max_occupancy: {
        type: Number,
        required: true
    },
    isOperational: {
        type: Boolean,
        default: true
    },
    isAvailable: {
        type: Boolean,
        default: true
    }
},
    {
        timestamps: true // Añadira campos automaticamente
        // añade createdAt y updatedAt (suele gustar mucho en proyectos).
    }
)

const Room = mongoose.model('Room', roomSchema);
module.exports = Room;