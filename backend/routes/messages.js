const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const { getDB } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { detectEmotion } = require('../ai/claude');

const PENDING_MS = 5 * 60 * 1000; // 5-minute reorder window

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = function (io) {
  const router = express.Router();

  // Helper: fetch full message with sender name
  const getFullMessage = (db, id) =>
    db.prepare('SELECT m.*, u.username AS sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?').get(id);

  // GET /api/messages/conversation/:userId
  router.get('/conversation/:userId', authenticateToken, (req, res) => {
    const db = getDB();
    const me = req.user.id;
    const other = req.params.userId;

    const messages = db.prepare(`
      SELECT m.*, u.username AS sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
        AND m.is_scheduled = 0
      ORDER BY m.seq_num ASC, m.created_at ASC
    `).all(me, other, other, me);

    res.json(messages);
  });

  // POST /api/messages/send
  router.post('/send', authenticateToken, async (req, res) => {
    const { receiverId, content, type = 'text', audioUrl } = req.body;
    if (!receiverId) return res.status(400).json({ error: 'receiverId required' });

    const db = getDB();
    const senderId = req.user.id;

    const lastSeq = db.prepare(`
      SELECT COALESCE(MAX(seq_num), 0) AS maxSeq FROM messages
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    `).get(senderId, receiverId, receiverId, senderId);

    const seqNum = (lastSeq?.maxSeq || 0) + 1;
    const pendingUntil = new Date(Date.now() + PENDING_MS).toISOString();
    const id = uuidv4();

    // Detect emotion (non-blocking)
    let emotion = 'neutral';
    if (content && content.trim().length > 0) {
      emotion = await detectEmotion(content).catch(() => 'neutral');
    }

    db.prepare(`
      INSERT INTO messages (id, sender_id, receiver_id, content, type, audio_url, emotion, seq_num, is_pending, pending_until, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'sent')
    `).run(id, senderId, receiverId, content || '', type, audioUrl || null, emotion, seqNum, pendingUntil);

    const message = getFullMessage(db, id);

    // Emit to both sender and receiver rooms
    io.to(`user_${receiverId}`).emit('new_message', message);
    io.to(`user_${senderId}`).emit('new_message', message);

    res.json(message);
  });

  // POST /api/messages/upload-audio
  router.post('/upload-audio', authenticateToken, upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const audioUrl = `/uploads/${req.file.filename}`;
    res.json({ audioUrl });
  });

  // POST /api/messages/schedule
  router.post('/schedule', authenticateToken, (req, res) => {
    const { receiverId, content, scheduledAt } = req.body;
    if (!receiverId || !content || !scheduledAt)
      return res.status(400).json({ error: 'receiverId, content, scheduledAt required' });

    const db = getDB();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO messages (id, sender_id, receiver_id, content, type, is_scheduled, scheduled_at, status, is_pending, seq_num)
      VALUES (?, ?, ?, ?, 'text', 1, ?, 'scheduled', 0, 0)
    `).run(id, req.user.id, receiverId, content, scheduledAt);

    const message = getFullMessage(db, id);
    // Notify sender's UI
    io.to(`user_${req.user.id}`).emit('message_scheduled', message);
    res.json({ success: true, message });
  });

  // GET /api/messages/scheduled
  router.get('/scheduled', authenticateToken, (req, res) => {
    const db = getDB();
    const messages = db.prepare(`
      SELECT m.*, u.username AS receiver_name
      FROM messages m JOIN users u ON m.receiver_id = u.id
      WHERE m.sender_id = ? AND m.is_scheduled = 1 AND m.status = 'scheduled'
      ORDER BY m.scheduled_at ASC
    `).all(req.user.id);
    res.json(messages);
  });

  // DELETE /api/messages/scheduled/:id
  router.delete('/scheduled/:id', authenticateToken, (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM messages WHERE id = ? AND sender_id = ? AND status = ?')
      .run(req.params.id, req.user.id, 'scheduled');
    res.json({ success: true });
  });

  // PATCH /api/messages/reorder
  router.patch('/reorder', authenticateToken, (req, res) => {
    const { messageIds, receiverId } = req.body;
    if (!Array.isArray(messageIds) || messageIds.length === 0)
      return res.status(400).json({ error: 'messageIds array required' });

    const db = getDB();
    const now = new Date().toISOString();
    const senderId = req.user.id;

    // Validate all messages are still in pending window and belong to sender
    for (const msgId of messageIds) {
      const msg = db.prepare(
        'SELECT id FROM messages WHERE id = ? AND sender_id = ? AND is_pending = 1 AND pending_until > ?'
      ).get(msgId, senderId, now);
      if (!msg) return res.status(400).json({ error: `Message ${msgId} cannot be reordered — 5-minute window expired` });
    }

    // Get the base seq_num from first message in original order
    const firstMsg = db.prepare('SELECT seq_num FROM messages WHERE id = ?').get(messageIds[0]);
    const baseSeq = firstMsg ? firstMsg.seq_num : 1;

    // Reassign seq_nums in new order
    const update = db.prepare('UPDATE messages SET seq_num = ? WHERE id = ?');
    const reorderTx = db.transaction((ids) => {
      ids.forEach((id, i) => update.run(baseSeq + i, id));
    });
    reorderTx(messageIds);

    // Broadcast new order to both parties
    const payload = { messageIds, senderId };
    io.to(`user_${receiverId}`).emit('messages_reordered', payload);
    io.to(`user_${senderId}`).emit('messages_reordered', payload);

    res.json({ success: true });
  });

  // PATCH /api/messages/:id/transcript
  router.patch('/:id/transcript', authenticateToken, (req, res) => {
    const { transcript, language } = req.body;
    const db = getDB();
    db.prepare('UPDATE messages SET transcript = ? WHERE id = ?').run(transcript, req.params.id);
    res.json({ success: true });
  });

  return router;
};
