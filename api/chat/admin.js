import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  createAdminSession,
  getAdminSession,
  deleteAdminSession,
  cleanExpiredSessions,
  listConversations,
  getConversation,
  listLeads,
  updateLeadNotes,
  getStats,
} from './db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ADMIN_PASSWORD = process.env.CHAT_ADMIN_PASSWORD;
const SESSION_EXPIRY_HOURS = 24;

// In-memory rate limiting for admin login: 5 attempts per 15 minutes per IP
const loginRateLimitMap = new Map();
const LOGIN_RATE_LIMIT_MAX = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, entries] of loginRateLimitMap) {
    const valid = entries.filter((ts) => now - ts < LOGIN_RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      loginRateLimitMap.delete(ip);
    } else {
      loginRateLimitMap.set(ip, valid);
    }
  }
}, 5 * 60 * 1000);

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entries = (loginRateLimitMap.get(ip) || []).filter(
    (ts) => now - ts < LOGIN_RATE_LIMIT_WINDOW_MS
  );
  if (entries.length >= LOGIN_RATE_LIMIT_MAX) return false;
  entries.push(now);
  loginRateLimitMap.set(ip, entries);
  return true;
}

// Clean expired sessions periodically
setInterval(() => {
  try {
    cleanExpiredSessions();
  } catch {
    // Ignore cleanup errors
  }
}, 60 * 60 * 1000);

// Middleware: verify Bearer token
function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.slice(7);
  const session = getAdminSession(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  if (new Date(session.expires_at) < new Date()) {
    deleteAdminSession(token);
    return res.status(401).json({ error: 'Session expired.' });
  }

  req.adminToken = token;
  next();
}

function mountAdminRoutes(app) {
  // Serve admin dashboard HTML
  let adminHtml;
  try {
    adminHtml = readFileSync(join(__dirname, 'admin-page.html'), 'utf-8');
  } catch {
    adminHtml = '<html><body><h1>Admin page not found</h1></body></html>';
  }

  app.get('/api/chat/admin/', (_req, res) => {
    res.type('html').send(adminHtml);
  });

  // Login
  app.post('/api/chat/admin/login', async (req, res) => {
    if (!ADMIN_PASSWORD) {
      return res.status(503).json({ error: 'Admin not configured.' });
    }

    if (!checkLoginRateLimit(req.ip)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }

    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password required.' });
    }

    const match = await bcrypt.compare(password, ADMIN_PASSWORD);
    if (!match) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();

    createAdminSession(token, expiresAt);
    res.json({ token, expiresAt });
  });

  // Logout
  app.post('/api/chat/admin/logout', adminAuthMiddleware, (req, res) => {
    deleteAdminSession(req.adminToken);
    res.json({ success: true });
  });

  // List conversations
  app.get('/api/chat/admin/conversations', adminAuthMiddleware, (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const result = listConversations(limit, offset);
    res.json(result);
  });

  // Get single conversation
  app.get('/api/chat/admin/conversations/:id', adminAuthMiddleware, (req, res) => {
    const conversation = getConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    res.json(conversation);
  });

  // Stats
  app.get('/api/chat/admin/stats', adminAuthMiddleware, (_req, res) => {
    const stats = getStats();
    res.json(stats);
  });

  // List leads
  app.get('/api/chat/admin/leads', adminAuthMiddleware, (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const result = listLeads(limit, offset);
    res.json(result);
  });

  // Update lead notes
  app.patch('/api/chat/admin/leads/:id/notes', adminAuthMiddleware, (req, res) => {
    const { notes } = req.body;
    if (notes === undefined || typeof notes !== 'string') {
      return res.status(400).json({ error: 'Notes field (string) required.' });
    }
    if (notes.length > 5000) {
      return res.status(400).json({ error: 'Notes too long (max 5000 chars).' });
    }
    const updated = updateLeadNotes(parseInt(req.params.id), notes);
    if (!updated) {
      return res.status(404).json({ error: 'Lead not found.' });
    }
    res.json({ success: true });
  });
}

export { mountAdminRoutes, adminAuthMiddleware };
