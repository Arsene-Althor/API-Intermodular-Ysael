/** P9 · Alias REST /users/:id/… (misma lógica que /user/:userId/…). */
const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middleware/authMiddleware');
const userStayController = require('../controllers/userStayController');

router.use(requireLogin);

router.get('/:id/history', userStayController.getHistory);
router.get('/:id/stats', userStayController.getStats);

module.exports = router;
