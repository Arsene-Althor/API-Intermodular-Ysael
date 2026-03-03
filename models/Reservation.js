// Modelo para reservas
const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  reservation_id:{
    type : String,
    required: [true, 'El ID de la reserva es obligatorio'],
    trim: true,
    unique: true,
    minlength: [9, 'El ID debe tener al menos 9 caracteres'],
    match: [/^RSV-[0-9]{5}$/, 'El formato debe ser RSV- seguido de 5 números (Ej: RSV-00001)']
  },  
  room_id:{
    type: String,
    required: [true, 'El ID de la habitación es obligatorio'],
    trim: true,
    minlength: [7, 'El ID debe tener al menos 7 caracteres'],
    match: [/^HAB-[0-9]{3}$/, 'El formato debe ser HAB- seguido de 3 números (Ej: HAB-101)']
    },
  user_id: {
        type: String,
        required: [true, 'El ID del usuario es obligatorio'],
        minlength: [9, 'El ID debe tener al menos 9 caracteres'],
        match: [/^(CLI|EMP)-[0-9]{5}$/, 'El formato debe ser CLI- o EMP- seguido de 5 números (Ej: EMP-00001)'],
        trim: true
    },
  check_in: {
        type: Date,
        required: [true, 'La fecha de entrada es obligatoria'],
        trim: true
    },
    check_out: {
        type: Date,
        required: [true, 'La fecha de salida es obligatoria'],
        trim: true
    },
    price:{
      type: Number,
      required: [true, 'El precio es obligatorio'],
      min:[0 , 'El precio debe ser mayor o igual 0']
      
    },
    cancelation_date: {
        type: Date,
        default: null,
        trim: true
    },
    createdBy:{
      type: String,
      required: [true, 'El ID del crador es obligatorio'],
      trim: true,
    }


},{ timestamps: true }//Añadira dos campos automaticametne:
//  Fecha de creación y de modificación "createdAt" y "updatedAt"
);

const Reservation = mongoose.model('Reservation', reservationSchema);
module.exports = Reservation;