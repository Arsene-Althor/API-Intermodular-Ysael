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
    -isAvailable: 
        - true  → disponible
        - false → no disponible
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