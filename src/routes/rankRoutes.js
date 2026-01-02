// todo-service/src/routes/rankRoutes.js
const express = require('express');
const router = express.Router();
const rankController = require('../controllers/rankController');
const { verifyToken } = require('../middleware/authMiddleware');

// All rank routes require authentication
router.use(verifyToken);

// Rank endpoints
router.get('/info', rankController.getRankInfo);
router.get('/history', rankController.getRankUpgradeHistory);
router.get('/leaderboard', rankController.getLeaderboard);

module.exports = router;
