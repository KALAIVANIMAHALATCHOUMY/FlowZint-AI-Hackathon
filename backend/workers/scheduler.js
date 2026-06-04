const cron = require('node-cron');
const { getDB } = require('../db/database');

function startScheduler(io) {
  // Check every minute for scheduled messages that are due
  cron.schedule('* * * * *', () => {
    const db = getDB();
    const now = new Date().toISOString();

    const dueMsgs = db.prepare(`
      SELECT m.*, u.username AS sender_name
      FROM messages m JOIN users u ON m.sender_id = u.id
      WHERE m.is_scheduled = 1
        AND m.status = 'scheduled'
        AND m.scheduled_at <= ?
    `).all(now);

    for (const msg of dueMsgs) {
      // Get next seq_num for this conversation
      const lastSeq = db.prepare(`
        SELECT COALESCE(MAX(seq_num), 0) AS maxSeq FROM messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      `).get(msg.sender_id, msg.receiver_id, msg.receiver_id, msg.sender_id);

      const seqNum = (lastSeq?.maxSeq || 0) + 1;
      const pendingUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      // Mark as sent and assign sequence
      db.prepare(`
        UPDATE messages
        SET status = 'sent', is_scheduled = 0, is_pending = 1,
            pending_until = ?, seq_num = ?, created_at = ?
        WHERE id = ?
      `).run(pendingUntil, seqNum, new Date().toISOString(), msg.id);

      const delivered = { ...msg, status: 'sent', is_scheduled: 0, is_pending: 1, seq_num: seqNum };

      // Emit to both users
      io.to(`user_${msg.receiver_id}`).emit('new_message', delivered);
      io.to(`user_${msg.sender_id}`).emit('scheduled_message_sent', delivered);

      console.log(`⏰ Scheduled message delivered: ${msg.id} to user ${msg.receiver_id}`);
    }

    // Unlock messages past their pending window
    db.prepare(`
      UPDATE messages SET is_pending = 0
      WHERE is_pending = 1 AND pending_until < ?
    `).run(now);
  });

  console.log('⏰ Scheduler started (checks every minute)');
}

module.exports = { startScheduler };
