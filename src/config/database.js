// todo-service/src/config/database.js
const mysql = require('mysql2/promise');

// MySQL/RDS Connection Pool Configuration
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Initialize Database Tables
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    
    // Create todos table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS todos (
        todo_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        task TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_completed (completed),
        INDEX idx_user_completed (user_id, completed)
      )
    `);

    // Create rank_upgrades table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS rank_upgrades (
        upgrade_id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        from_rank VARCHAR(50) NOT NULL,
        to_rank VARCHAR(50) NOT NULL,
        tasks_completed_at_upgrade INT NOT NULL,
        upgraded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_to_rank (to_rank)
      )
    `);
    
    connection.release();
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

module.exports = { pool, initializeDatabase };
