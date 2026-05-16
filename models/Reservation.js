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
    /** Nº factura fiscal (tras checkout). Sin `default`: no se persiste `null` en BSON (evita E11000 con índice único). */
    invoice_number: {
        type: String,
        trim: true,
    },
    /** Pago simulado de la reserva (emisión factura reserva). */
    booking_paid_at: {
        type: Date,
        default: null,
    },
    /** Marca de tiempo del checkout en recepción (sin factura obligatoria). */
    checkout_completed_at: {
        type: Date,
        default: null,
    },
    /** Si una ampliación creó otra reserva, id de la nueva. */
    superseded_by_reservation_id: {
        type: String,
        default: null,
        trim: true,
    },
    /** Reserva anterior sustituida por ampliación con cambio de habitación. */
    extended_from_reservation_id: {
        type: String,
        default: null,
        trim: true,
    },
    /** Desglose congelado en checkout (noches, extras, descuentos). Ver invoiceBreakdownService. */
    invoice_breakdown: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    /** Check-in registrado en recepción (fecha/hora real de llegada del huésped). */
    reception_check_in_at: {
        type: Date,
        default: null,
    },
    /** Si el check-in fue fuera de la ventana horaria estándar. */
    reception_check_in_late: {
        type: Boolean,
        default: false,
    },
    /** Recargo TTC aplicado al registrar check-in tardío (sumado a price). */
    reception_check_in_late_fee: {
        type: Number,
        default: 0,
        min: [0, 'El recargo no puede ser negativo'],
    },
    /** P19 · Solicitud de entrada anticipada (programa flexibilidad / fidelidad). */
    early_checkin_requested: {
        type: new mongoose.Schema(
            {
                requested_at: { type: Date, default: Date.now },
                requested_time: { type: Date, required: true },
                status: {
                    type: String,
                    enum: ['pending', 'approved', 'rejected'],
                    default: 'pending',
                },
                loyalty_tier: {
                    type: String,
                    enum: ['bronze', 'silver', 'gold'],
                    default: 'bronze',
                },
                hours_difference: { type: Number, min: 0 },
                rate_per_hour: { type: Number, min: 0 },
                base_fee: { type: Number, min: 0 },
                discount_percent: { type: Number, min: 0, max: 100, default: 0 },
                final_fee: { type: Number, min: 0 },
                availability_ok: { type: Boolean, default: null },
                client_notified_at: { type: Date, default: null },
                auto_approved: { type: Boolean, default: false },
                approval_mode: {
                    type: String,
                    enum: ['manual', 'automatic'],
                    default: 'manual',
                },
                reviewed_at: { type: Date, default: null },
                reviewed_by: { type: String, default: null },
                review_note: { type: String, default: null },
            },
            { _id: false },
        ),
        default: null,
    },
    /** P19 · Solicitud de salida tardía. */
    late_checkout_requested: {
        type: new mongoose.Schema(
            {
                requested_at: { type: Date, default: Date.now },
                requested_time: { type: Date, required: true },
                status: {
                    type: String,
                    enum: ['pending', 'approved', 'rejected'],
                    default: 'pending',
                },
                loyalty_tier: {
                    type: String,
                    enum: ['bronze', 'silver', 'gold'],
                    default: 'bronze',
                },
                hours_difference: { type: Number, min: 0 },
                rate_per_hour: { type: Number, min: 0 },
                base_fee: { type: Number, min: 0 },
                discount_percent: { type: Number, min: 0, max: 100, default: 0 },
                final_fee: { type: Number, min: 0 },
                availability_ok: { type: Boolean, default: null },
                client_notified_at: { type: Date, default: null },
                auto_approved: { type: Boolean, default: false },
                approval_mode: {
                    type: String,
                    enum: ['manual', 'automatic'],
                    default: 'manual',
                },
                reviewed_at: { type: Date, default: null },
                reviewed_by: { type: String, default: null },
                review_note: { type: String, default: null },
                /** room = habitación; facilities = zonas comunes (habitación liberada, máx. 20:00). */
                late_mode: {
                    type: String,
                    enum: ['room', 'facilities'],
                    default: 'room',
                },
            },
            { _id: false },
        ),
        default: null,
    },
    createdBy:{
      type: String,
      required: [true, 'El ID del crador es obligatorio'],
      trim: true,
    }


},{ timestamps: true }//Añadira dos campos automaticametne:
//  Fecha de creación y de modificación "createdAt" y "updatedAt"
);

// Único solo cuando hay número de factura (string). Varios documentos sin campo / sin factura: OK.
reservationSchema.index(
  { invoice_number: 1 },
  {
    unique: true,
    partialFilterExpression: { invoice_number: { $type: 'string' } },
  },
);

const Reservation = mongoose.model('Reservation', reservationSchema);
module.exports = Reservation;