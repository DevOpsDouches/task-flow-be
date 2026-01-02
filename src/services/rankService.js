// todo-service/src/services/rankService.js
const { pool } = require('../config/database');
const { calculateRank, checkRankUpgrade, RANK_THRESHOLDS } = require('../utils/ranks');

/**
 * Update user's rank based on completed tasks
 * @param {string} userId 
 * @param {Object} connection - MySQL connection (optional, for transactions)
 * @returns {Object} - Rank update result
 */
async function updateUserRank(userId, connection = null) {
  const shouldReleaseConnection = !connection;
  
  try {
    if (!connection) {
      connection = await pool.getConnection();
    }

    // Get current user rank and completed tasks
    const [users] = await connection.query(
      'SELECT current_rank, total_completed_tasks FROM users WHERE user_id = ?',
      [userId]
    );

    if (users.length === 0) {
      if (shouldReleaseConnection) connection.release();
      return { success: false, message: 'User not found' };
    }

    const user = users[0];
    const oldRank = user.current_rank;
    const completedTasks = user.total_completed_tasks;

    // Calculate new rank
    const newRank = calculateRank(completedTasks);

    // Check if upgrade occurred
    const upgrade = checkRankUpgrade(
      user.total_completed_tasks - 1, // Previous count
      completedTasks // Current count
    );

    if (upgrade && upgrade.upgraded) {
      // Update user's rank
      await connection.query(
        'UPDATE users SET current_rank = ?, rank_upgraded_at = NOW() WHERE user_id = ?',
        [newRank, userId]
      );

      // Record rank upgrade
      const upgradeId = `upgrade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await connection.query(
        'INSERT INTO rank_upgrades (upgrade_id, user_id, from_rank, to_rank, tasks_completed_at_upgrade) VALUES (?, ?, ?, ?, ?)',
        [upgradeId, userId, oldRank, newRank, completedTasks]
      );

      if (shouldReleaseConnection) connection.release();

      return {
        success: true,
        upgraded: true,
        fromRank: oldRank,
        toRank: newRank,
        rankInfo: RANK_THRESHOLDS[newRank]
      };
    }

    if (shouldReleaseConnection) connection.release();

    return {
      success: true,
      upgraded: false,
      currentRank: newRank
    };

  } catch (error) {
    if (shouldReleaseConnection && connection) connection.release();
    console.error('Error updating user rank:', error);
    return { success: false, message: 'Failed to update rank' };
  }
}

/**
 * Get user's rank information
 * @param {string} userId 
 * @returns {Object} - Rank information
 */
async function getUserRankInfo(userId) {
  let connection;
  try {
    connection = await pool.getConnection();

    const [users] = await connection.query(
      'SELECT current_rank, total_completed_tasks, rank_upgraded_at FROM users WHERE user_id = ?',
      [userId]
    );

    connection.release();

    if (users.length === 0) {
      return { success: false, message: 'User not found' };
    }

    const user = users[0];
    const rankInfo = RANK_THRESHOLDS[user.current_rank] || RANK_THRESHOLDS.iron;

    return {
      success: true,
      rank: {
        current: user.current_rank,
        displayName: rankInfo.displayName,
        color: rankInfo.color,
        totalCompleted: user.total_completed_tasks,
        upgradedAt: user.rank_upgraded_at
      }
    };

  } catch (error) {
    if (connection) connection.release();
    console.error('Error getting user rank info:', error);
    return { success: false, message: 'Failed to get rank info' };
  }
}

/**
 * Get user's rank history
 * @param {string} userId 
 * @returns {Object} - Rank upgrade history
 */
async function getRankHistory(userId) {
  let connection;
  try {
    connection = await pool.getConnection();

    const [upgrades] = await connection.query(
      'SELECT upgrade_id, from_rank, to_rank, tasks_completed_at_upgrade, upgraded_at FROM rank_upgrades WHERE user_id = ? ORDER BY upgraded_at DESC',
      [userId]
    );

    connection.release();

    const history = upgrades.map(upgrade => ({
      upgradeId: upgrade.upgrade_id,
      fromRank: RANK_THRESHOLDS[upgrade.from_rank]?.displayName || upgrade.from_rank,
      toRank: RANK_THRESHOLDS[upgrade.to_rank]?.displayName || upgrade.to_rank,
      tasksCompleted: upgrade.tasks_completed_at_upgrade,
      upgradedAt: upgrade.upgraded_at
    }));

    return {
      success: true,
      history
    };

  } catch (error) {
    if (connection) connection.release();
    console.error('Error getting rank history:', error);
    return { success: false, message: 'Failed to get rank history' };
  }
}

module.exports = {
  updateUserRank,
  getUserRankInfo,
  getRankHistory
};
