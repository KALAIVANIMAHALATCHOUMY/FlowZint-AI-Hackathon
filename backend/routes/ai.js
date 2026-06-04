const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getSmartReplies, summarizeConversation, extractTodos } = require('../ai/claude');
const { getDB } = require('../db/database');

const router = express.Router();

// POST /api/ai/smart-replies
router.post('/smart-replies', authenticateToken, async (req, res) => {
  const { conversationUserId, language = 'english' } = req.body;
  if (!conversationUserId) return res.status(400).json({ error: 'conversationUserId required' });

  const db = getDB();
  const me = req.user.id;

  const messages = db.prepare(`
    SELECT m.content, u.username AS sender_name
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
      AND m.type = 'text' AND m.is_scheduled = 0 AND m.content != ''
    ORDER BY m.created_at DESC LIMIT 8
  `).all(me, conversationUserId, conversationUserId, me).reverse();

  if (messages.length === 0) return res.json({ replies: ['Hello!', 'Hi there!', 'Hey!'] });

  try {
    const replies = await getSmartReplies(messages, language);
    res.json({ replies });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI error', replies: ['Sure!', 'Got it!', 'Let me check.'] });
  }
});

// POST /api/ai/summarize
router.post('/summarize', authenticateToken, async (req, res) => {
  const { conversationUserId, language = 'english' } = req.body;
  if (!conversationUserId) return res.status(400).json({ error: 'conversationUserId required' });

  const db = getDB();
  const me = req.user.id;

  const messages = db.prepare(`
    SELECT m.content, u.username AS sender_name
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
      AND m.type = 'text' AND m.is_scheduled = 0 AND m.content != ''
    ORDER BY m.created_at ASC
  `).all(me, conversationUserId, conversationUserId, me);

  if (messages.length < 2)
    return res.json({ summary: ['Not enough messages to summarize yet.'] });

  try {
    const summary = await summarizeConversation(messages, language);
    res.json({ summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI error' });
  }
});

// POST /api/ai/todos
router.post('/todos', authenticateToken, async (req, res) => {
  const { conversationUserId } = req.body;
  if (!conversationUserId) return res.status(400).json({ error: 'conversationUserId required' });

  const db = getDB();
  const me = req.user.id;

  const messages = db.prepare(`
    SELECT m.content, u.username AS sender_name
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
      AND m.type = 'text' AND m.is_scheduled = 0 AND m.content != ''
    ORDER BY m.created_at ASC
  `).all(me, conversationUserId, conversationUserId, me);

  try {
    const todos = await extractTodos(messages);
    res.json({ todos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'AI error' });
  }
});

module.exports = router;
