const mongoose = require('mongoose');

const extraServiceSchema = new mongoose.Schema(
  {
    service_id: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExtraService', extraServiceSchema);
