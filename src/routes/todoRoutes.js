// todo-service/src/routes/todoRoutes.js
const express = require('express');
const router = express.Router();
const todoController = require('../controllers/todoController');
const { verifyToken } = require('../middleware/authMiddleware');

// All todo routes require authentication
router.use(verifyToken);

// Todo endpoints
router.get('/', todoController.getTodos);
router.post('/', todoController.createTodo);
router.get('/stats', todoController.getStats); // Must be before /:todoId
router.get('/:todoId', todoController.getTodoById);
router.put('/:todoId', todoController.updateTodo);
router.delete('/:todoId', todoController.deleteTodo);

module.exports = router;
