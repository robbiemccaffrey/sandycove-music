import Database from 'better-sqlite3';
import path from 'path';

let db;

function initDb() {
  const dbPath = process.env.CHAT_DB_PATH || path.join(process.cwd(), 'chat.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      messages TEXT NOT NULL DEFAULT '[]',
      turn_count INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0,
      total_duration_ms REAL DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT REFERENCES conversations(id),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      interest TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      email_sent INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// --- Conversations ---

function createConversation(id, ipAddress, userAgent) {
  const db = getDb();
  db.prepare(
    `INSERT INTO conversations (id, ip_address, user_agent) VALUES (?, ?, ?)`
  ).run(id, ipAddress, userAgent);
}

function getConversation(id) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id);
  if (row) row.messages = JSON.parse(row.messages);
  return row;
}

function updateConversation(id, messages, usageSummary) {
  const db = getDb();
  db.prepare(`
    UPDATE conversations SET
      messages = ?,
      turn_count = ?,
      total_tokens = ?,
      input_tokens = ?,
      output_tokens = ?,
      total_cost = ?,
      total_duration_ms = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    JSON.stringify(messages),
    usageSummary.turnCount,
    usageSummary.totalTokens,
    usageSummary.inputTokens,
    usageSummary.outputTokens,
    usageSummary.totalCost,
    usageSummary.totalDurationMs,
    id
  );
}

function listConversations(limit = 20, offset = 0) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, created_at, updated_at, turn_count, total_tokens, total_cost,
      (SELECT COUNT(*) FROM leads WHERE conversation_id = conversations.id) as lead_count
    FROM conversations
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as count FROM conversations`).get().count;
  return { rows, total };
}

// --- Leads ---

function createLead(conversationId, name, email, phone, interest) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO leads (conversation_id, name, email, phone, interest)
    VALUES (?, ?, ?, ?, ?)
  `).run(conversationId, name, email || null, phone || null, interest || null);
  return result.lastInsertRowid;
}

function countRecentLeads(conversationId, windowMinutes) {
  const db = getDb();
  return db.prepare(`
    SELECT COUNT(*) as count FROM leads
    WHERE conversation_id = ? AND created_at > datetime('now', '-' || ? || ' minutes')
  `).get(conversationId, windowMinutes).count;
}

function markLeadEmailSent(leadId) {
  const db = getDb();
  db.prepare(`UPDATE leads SET email_sent = 1 WHERE id = ?`).run(leadId);
}

function listLeads(limit = 20, offset = 0) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as count FROM leads`).get().count;
  return { rows, total };
}

function updateLeadNotes(id, notes) {
  const db = getDb();
  const result = db.prepare(`UPDATE leads SET notes = ? WHERE id = ?`).run(notes, id);
  return result.changes > 0;
}

// --- Admin Sessions ---

function createAdminSession(token, expiresAt) {
  const db = getDb();
  db.prepare(`INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)`).run(token, expiresAt);
}

function getAdminSession(token) {
  const db = getDb();
  return db.prepare(`SELECT * FROM admin_sessions WHERE token = ?`).get(token);
}

function deleteAdminSession(token) {
  const db = getDb();
  db.prepare(`DELETE FROM admin_sessions WHERE token = ?`).run(token);
}

function cleanExpiredSessions() {
  const db = getDb();
  db.prepare(`DELETE FROM admin_sessions WHERE expires_at < datetime('now')`).run();
}

// --- Stats ---

function getStats() {
  const db = getDb();

  function statsForPeriod(hours) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    return db.prepare(`
      SELECT
        COUNT(*) as conversations,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(total_cost), 0) as cost
      FROM conversations
      WHERE created_at >= ?
    `).get(cutoff);
  }

  return {
    day: statsForPeriod(24),
    week: statsForPeriod(168),
    month: statsForPeriod(720),
    allTime: db.prepare(`
      SELECT
        COUNT(*) as conversations,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(total_cost), 0) as cost
      FROM conversations
    `).get(),
  };
}

export {
  initDb,
  getDb,
  createConversation,
  getConversation,
  updateConversation,
  listConversations,
  createLead,
  countRecentLeads,
  markLeadEmailSent,
  listLeads,
  updateLeadNotes,
  createAdminSession,
  getAdminSession,
  deleteAdminSession,
  cleanExpiredSessions,
  getStats,
};
