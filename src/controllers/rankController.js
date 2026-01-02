// todo-service/src/controllers/rankController.js
const { getUserRankInfo, getRankHistory } = require('../services/rankService');
const { getRankProgress } = require('../utils/ranks');
const { pool } = require('../config/database');

// Get user's current rank information with progress
async function getRankInfo(req, res) {
  try {
    const { userId } = req.user;

    const result = await getUserRankInfo(userId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    // Calculate progress to next rank
    const progress = getRankProgress(result.rank.totalCompleted);

    res.json({
      success: true,
      rank: result.rank,
      progress: {
        current: progress.progress,
        nextRank: progress.nextRank,
        tasksToNext: progress.tasksToNext,
        isMaxRank: progress.isMaxRank
      }
    });

  } catch (error) {
    console.error('Get rank info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rank information'
    });
  }
}

// Get user's rank upgrade history
async function getRankUpgradeHistory(req, res) {
  try {
    const { userId } = req.user;

    const result = await getRankHistory(userId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      history: result.history
    });

  } catch (error) {
    console.error('Get rank history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get rank history'
    });
  }
}

// Get leaderboard (top users by rank and completed tasks)
async function getLeaderboard(req, res) {
  let connection;
  try {
    const limit = parseInt(req.query.limit) || 10;

    connection = await pool.getConnection();

    const [users] = await connection.query(
      `SELECT 
        username, 
        current_rank, 
        total_completed_tasks,
        rank_upgraded_at
      FROM users 
      ORDER BY 
        FIELD(current_rank, 'todo_master', 'platinum', 'diamond', 'gold', 'silver', 'iron'),
        total_completed_tasks DESC
      LIMIT ?`,
      [limit]
    );

    connection.release();

    res.json({
      success: true,
      leaderboard: users
    });

  } catch (error) {
    if (connection) connection.release();
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboard'
    });
  }
}

module.exports = {
  getRankInfo,
  getRankUpgradeHistory,
  getLeaderboard
};
