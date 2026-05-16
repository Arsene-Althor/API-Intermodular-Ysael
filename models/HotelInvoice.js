const mongoose = require('mongoose');

const INVOICE_TYPES = ['reservation', 'early_checkin', 'late_checkout', 'stay_extension'];

const hotelInvoiceSchema = new mongoose.Schema(
  {
    invoice_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    reservation_id: {
      type: String,
      required: true,
      trim: true,
      match: [/^RSV-[0-9]{5}$/, 'Formato RSV-xxxxx'],
    },
    user_id: {
      type: String,
      required: true,
      trim: true,
    },
    room_id: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: INVOICE_TYPES,
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    issued_at: { type: Date, default: Date.now },
    invoice_breakdown: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Si la ampliación creó otra reserva, referencia. */
    linked_reservation_id: { type: String, default: null },
  },
  { timestamps: true },
);

hotelInvoiceSchema.index({ reservation_id: 1, type: 1 });
hotelInvoiceSchema.index({ user_id: 1, issued_at: -1 });
hotelInvoiceSchema.index({ issued_at: -1 });

const HotelInvoice = mongoose.model('HotelInvoice', hotelInvoiceSchema);
module.exports = HotelInvoice;
module.exports.INVOICE_TYPES = INVOICE_TYPES;
