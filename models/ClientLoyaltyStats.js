/**
 * P9 · Estadísticas y rango de fidelidad por cliente (colección propia).
 * P19 usa loyalty_tier para descuentos en check-in anticipado / check-out tardío.
 */
const mongoose = require('mongoose');

const clientLoyaltyStatsSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^(CLI|EMP)-[0-9]{5}$/, 'Formato CLI-xxxxx o EMP-xxxxx'],
    },
    loyalty_tier: {
      type: String,
      enum: ['bronze', 'silver', 'gold'],
      default: 'bronze',
    },
    total_nights: { type: Number, default: 0, min: 0 },
    total_spent: { type: Number, default: 0, min: 0 },
    completed_stays_count: { type: Number, default: 0, min: 0 },
    last_stay_checkout_at: { type: Date, default: null },
  },
  { timestamps: true },
);

const ClientLoyaltyStats = mongoose.model('ClientLoyaltyStats', clientLoyaltyStatsSchema);
module.exports = ClientLoyaltyStats;
