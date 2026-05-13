const ExtraService = require('../models/ExtraService');

async function listExtraServices(req, res) {
  try {
    const list = await ExtraService.find({ active: { $ne: false } }).sort({ name: 1 }).lean();
    return res.json(list);
  } catch (err) {
    console.error('listExtraServices', err);
    return res.status(500).json({ error: err.message });
  }
}

async function createExtraService(req, res) {
  try {
    const name = req.body?.name != null ? String(req.body.name).trim() : '';
    if (!name) return res.status(400).json({ error: 'name obligatorio' });

    const last = await ExtraService.findOne().sort({ createdAt: -1 }).select('service_id').lean();
    let n = 1;
    if (last?.service_id) {
      const m = /^EXT-(\d+)$/.exec(last.service_id);
      if (m) n = parseInt(m[1], 10) + 1;
    }
    const service_id = `EXT-${String(n).padStart(3, '0')}`;
    const doc = await ExtraService.create({ service_id, name, active: true });
    return res.status(201).json(doc);
  } catch (err) {
    console.error('createExtraService', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { listExtraServices, createExtraService };
