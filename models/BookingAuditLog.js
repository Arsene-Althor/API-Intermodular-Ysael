// Colección MongoDB: booking_audit_log
const mongoose = require('mongoose');

const bookingAuditLogSchema = new mongoose.Schema(
  {
    booking_id: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    actor_id: {
      type: String,
      required: true,
      trim: true,
    },
    actor_type: {
      type: String,
      required: true,
      enum: ['user', 'employee'],
    },
    previous_state: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    new_state: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { collection: 'booking_audit_log' }
);

bookingAuditLogSchema.index({ booking_id: 1, timestamp: 1 });

module.exports = mongoose.model('Booking_Audit_Log', bookingAuditLogSchema);
