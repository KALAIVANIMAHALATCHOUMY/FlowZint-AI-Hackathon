const Database = require('better-sqlite3');
const path = require('path');

let db;

function getDB() {
  if (!db) {
    db = new Database(path.join(__dirname, '../smartchat.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      username   TEXT UNIQUE NOT NULL,
      password   TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id           TEXT PRIMARY KEY,
      sender_id    TEXT NOT NULL,
      receiver_id  TEXT NOT NULL,
      content      TEXT DEFAULT '',
      type         TEXT DEFAULT 'text',
      audio_url    TEXT,
      transcript   TEXT,
      emotion      TEXT DEFAULT 'neutral',
      seq_num      INTEGER DEFAULT 0,
      status       TEXT DEFAULT 'sent',
      is_scheduled INTEGER DEFAULT 0,
      scheduled_at DATETIME,
      is_pending   INTEGER DEFAULT 1,
      pending_until DATETIME,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id)   REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(sender_id, receiver_id);

    CREATE INDEX IF NOT EXISTS idx_messages_scheduled
      ON messages(is_scheduled, status, scheduled_at);
  `);

  console.log('✅ Database initialized');
}

module.exports = { getDB, initDB };
