const { getUserStayHistory, getUserStayStats } = require('../services/userStayService');

function canAccessUser(req, userId) {
  if (req.user.role === 'admin' || req.user.role === 'employee') return true;
  return String(req.user.user_id).trim() === String(userId).trim();
}

async function getHistory(req, res) {
  try {
    const userId = req.params.id || req.params.userId;
    if (!userId) return res.status(400).json({ error: 'Falta id de usuario' });
    if (!canAccessUser(req, userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const data = await getUserStayHistory(userId, req.query);
    return res.json(data);
  } catch (err) {
    console.error('getHistory', err);
    return res.status(500).json({ error: 'Error al obtener historial', detalle: err.message });
  }
}

async function getStats(req, res) {
  try {
    const userId = req.params.id || req.params.userId;
    if (!userId) return res.status(400).json({ error: 'Falta id de usuario' });
    if (!canAccessUser(req, userId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const data = await getUserStayStats(userId, req.query);
    return res.json(data);
  } catch (err) {
    console.error('getStats', err);
    return res.status(500).json({ error: 'Error al obtener estadísticas', detalle: err.message });
  }
}

module.exports = { getHistory, getStats };
