const mongoose = require('mongoose');

const extraServiceSchema = new mongoose.Schema(
  {
    service_id: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    /** Precio TTC por unidad en factura (0 = servicio incluido sin cargo explícito). */
    price: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExtraService', extraServiceSchema);
