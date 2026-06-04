const express = require('express');
const { getDB } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - all users except me
router.get('/', authenticateToken, (req, res) => {
  const db = getDB();
  const users = db
    .prepare('SELECT id, username, created_at FROM users WHERE id != ? ORDER BY username ASC')
    .all(req.user.id);
  res.json(users);
});

// GET /api/users/search?q=...
router.get('/search', authenticateToken, (req, res) => {
  const { q = '' } = req.query;
  const db = getDB();
  const users = db
    .prepare("SELECT id, username FROM users WHERE username LIKE ? AND id != ? ORDER BY username ASC")
    .all(`%${q}%`, req.user.id);
  res.json(users);
});

module.exports = router;
