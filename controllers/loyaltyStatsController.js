const { getClientLoyaltyStats, syncClientLoyaltyStats } = require('../services/clientLoyaltyStatsService');
const { getUserStayStats } = require('../services/userStayService');

async function mergeP9Stats(userId, base) {
  const p9 = await getUserStayStats(userId, {});
  return { ...base, ...p9 };
}

async function getMyLoyaltyStats(req, res) {
  try {
    const userId = req.user.user_id;
    const stats = await mergeP9Stats(userId, await getClientLoyaltyStats(userId, { resync: true }));
    return res.json(stats);
  } catch (err) {
    console.error('getMyLoyaltyStats', err);
    return res.status(500).json({ error: 'Error al obtener estadísticas', detalle: err.message });
  }
}

async function syncMyLoyaltyStats(req, res) {
  try {
    const userId = req.user.user_id;
    const stats = await syncClientLoyaltyStats(userId);
    return res.json({ ok: true, stats });
  } catch (err) {
    console.error('syncMyLoyaltyStats', err);
    return res.status(500).json({ error: 'Error al sincronizar estadísticas', detalle: err.message });
  }
}

/** Personal: estadísticas de un cliente por user_id. */
async function getUserLoyaltyStats(req, res) {
  try {
    const { userId } = req.params;
    const stats = await mergeP9Stats(
      userId,
      await getClientLoyaltyStats(userId, { resync: req.query.resync !== '0' }),
    );
    return res.json(stats);
  } catch (err) {
    console.error('getUserLoyaltyStats', err);
    return res.status(500).json({ error: 'Error al obtener estadísticas', detalle: err.message });
  }
}

module.exports = {
  getMyLoyaltyStats,
  syncMyLoyaltyStats,
  getUserLoyaltyStats,
};
