// todo-service/src/controllers/todoController.js
const { pool } = require('../config/database');
const { updateUserRank } = require('../services/rankService');

// Get all todos for a user
async function getTodos(req, res) {
  let connection;
  try {
    const { userId } = req.user;

    connection = await pool.getConnection();

    const [todos] = await connection.query(
      'SELECT todo_id, user_id, task, completed, completed_at, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    connection.release();

    res.json({
      success: true,
      todos: todos
    });

  } catch (error) {
    if (connection) connection.release();
    console.error('Get todos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve todos'
    });
  }
}

// Create a new todo
async function createTodo(req, res) {
  let connection;
  try {
    const { userId } = req.user;
    const { task } = req.body;

    if (!task || task.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Task is required'
      });
    }

    const todoId = `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    connection = await pool.getConnection();

    await connection.query(
      'INSERT INTO todos (todo_id, user_id, task, completed) VALUES (?, ?, ?, ?)',
      [todoId, userId, task.trim(), false]
    );

    const [newTodos] = await connection.query(
      'SELECT todo_id, user_id, task, completed, completed_at, created_at, updated_at FROM todos WHERE todo_id = ?',
      [todoId]
    );

    connection.release();

    res.status(201).json({
      success: true,
      todo: newTodos[0]
    });

  } catch (error) {
    if (connection) connection.release();
    console.error('Create todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create todo'
    });
  }
}

// Get todo statistics
async function getStats(req, res) {
  let connection;
  try {
    const { userId } = req.user;

    connection = await pool.getConnection();

    const [stats] = await connection.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END) as pending
      FROM todos WHERE user_id = ?`,
      [userId]
    );

    connection.release();

    res.json({
      success: true,
      stats: stats[0]
    });

  } catch (error) {
    if (connection) connection.release();
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics'
    });
  }
}

// Update a todo (with rank progression on completion)
async function updateTodo(req, res) {
  let connection;
  try {
    const { userId } = req.user;
    const { todoId } = req.params;
    const { task, completed } = req.body;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // First, verify the todo belongs to the user
    const [existingTodos] = await connection.query(
      'SELECT todo_id, user_id, completed FROM todos WHERE todo_id = ?',
      [todoId]
    );

    if (existingTodos.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    if (existingTodos[0].user_id !== userId) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this todo'
      });
    }

    const wasCompleted = existingTodos[0].completed;

    // Build update query
    let updateFields = [];
    let updateValues = [];

    if (task !== undefined) {
      updateFields.push('task = ?');
      updateValues.push(task.trim());
    }

    if (completed !== undefined) {
      updateFields.push('completed = ?');
      updateValues.push(completed);
      
      // Set completed_at timestamp
      if (completed && !wasCompleted) {
        updateFields.push('completed_at = NOW()');
      } else if (!completed && wasCompleted) {
        updateFields.push('completed_at = NULL');
      }
    }

    if (updateFields.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updateValues.push(todoId);

    await connection.query(
      `UPDATE todos SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE todo_id = ?`,
      updateValues
    );

    // Update user's total_completed_tasks count if completion status changed
    let rankUpdateResult = null;
    if (completed !== undefined && completed !== wasCompleted) {
      if (completed) {
        // Task was completed
        await connection.query(
          'UPDATE users SET total_completed_tasks = total_completed_tasks + 1 WHERE user_id = ?',
          [userId]
        );
        
        // Check for rank upgrade
        rankUpdateResult = await updateUserRank(userId, connection);
      } else {
        // Task was un-completed
        await connection.query(
          'UPDATE users SET total_completed_tasks = GREATEST(0, total_completed_tasks - 1) WHERE user_id = ?',
          [userId]
        );
      }
    }

    const [updatedTodos] = await connection.query(
      'SELECT todo_id, user_id, task, completed, completed_at, created_at, updated_at FROM todos WHERE todo_id = ?',
      [todoId]
    );

    await connection.commit();
    connection.release();

    const response = {
      success: true,
      todo: updatedTodos[0]
    };

    // Include rank upgrade info if it occurred
    if (rankUpdateResult && rankUpdateResult.upgraded) {
      response.rankUpgrade = {
        upgraded: true,
        fromRank: rankUpdateResult.fromRank,
        toRank: rankUpdateResult.toRank,
        rankInfo: rankUpdateResult.rankInfo
      };
    }

    res.json(response);

  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('Update todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update todo'
    });
  }
}

// Delete a todo (adjust completed count if it was completed)
async function deleteTodo(req, res) {
  let connection;
  try {
    const { userId } = req.user;
    const { todoId } = req.params;

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // First, verify the todo belongs to the user
    const [existingTodos] = await connection.query(
      'SELECT todo_id, user_id, completed FROM todos WHERE todo_id = ?',
      [todoId]
    );

    if (existingTodos.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    if (existingTodos[0].user_id !== userId) {
      await connection.rollback();
      connection.release();
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this todo'
      });
    }

    const wasCompleted = existingTodos[0].completed;

    // Delete the todo
    await connection.query(
      'DELETE FROM todos WHERE todo_id = ?',
      [todoId]
    );

    // If the todo was completed, decrement the user's completed tasks count
    if (wasCompleted) {
      await connection.query(
        'UPDATE users SET total_completed_tasks = GREATEST(0, total_completed_tasks - 1) WHERE user_id = ?',
        [userId]
      );
    }

    await connection.commit();
    connection.release();

    res.json({
      success: true,
      message: 'Todo deleted successfully'
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('Delete todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete todo'
    });
  }
}

// Get a single todo by ID
async function getTodoById(req, res) {
  let connection;
  try {
    const { userId } = req.user;
    const { todoId } = req.params;

    connection = await pool.getConnection();

    const [todos] = await connection.query(
      'SELECT todo_id, user_id, task, completed, completed_at, created_at, updated_at FROM todos WHERE todo_id = ?',
      [todoId]
    );

    connection.release();

    if (todos.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Todo not found'
      });
    }

    if (todos[0].user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to access this todo'
      });
    }

    res.json({
      success: true,
      todo: todos[0]
    });

  } catch (error) {
    if (connection) connection.release();
    console.error('Get todo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve todo'
    });
  }
}

module.exports = {
  getTodos,
  createTodo,
  getStats,
  updateTodo,
  deleteTodo,
  getTodoById
};
