// todo-service/src/middleware/authMiddleware.js
const axios = require('axios');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

// Middleware to verify token with Auth Service
async function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    // Verify token with auth service
    const response = await axios.post(
      `${AUTH_SERVICE_URL}/api/auth/verify`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.data.success) {
      req.user = {
        userId: response.data.userId,
        username: response.data.username
      };
      next();
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  } catch (error) {
    console.error('Token verification error:', error.message);
    res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
}

module.exports = { verifyToken };
