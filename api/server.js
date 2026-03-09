import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import OpenAI from 'openai';
import { initDb } from './chat/db.js';
import { chat } from './chat/agent.js';
import { mountAdminRoutes } from './chat/admin.js';

// Load .env file if present (local dev — no extra dependency needed)
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envFile = readFileSync(join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch (_e) {}

const app = express();
const PORT = process.env.PORT || 4061;

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://sandycoveschoolofmusic.com';
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@sandycoveschoolofmusic.com';
const SES_TO_EMAIL = process.env.SES_TO_EMAIL || 'info@sandycoveschoolofmusic.com';
const AWS_REGION = process.env.AWS_REGION || 'eu-west-1';

const ses = new SESClient({ region: AWS_REGION });

const allowedOrigins = [ALLOWED_ORIGIN];
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:4321', 'http://localhost:4060');
}
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10kb' }));

// In-memory rate limiting: max 5 submissions per IP per hour
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// Clean up expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entries] of rateLimitMap) {
    const valid = entries.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, valid);
    }
  }
}, 10 * 60 * 1000);

function checkRateLimit(ip) {
  const now = Date.now();
  const entries = (rateLimitMap.get(ip) || []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );

  if (entries.length >= RATE_LIMIT_MAX) {
    return false;
  }

  entries.push(now);
  rateLimitMap.set(ip, entries);
  return true;
}

app.post('/api/contact', async (req, res) => {
  const clientIp = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip;

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { name, email, phone, message } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required.' });
  }
  if (name.length > 200 || email.length > 200 || (phone && phone.length > 50) || message.length > 5000) {
    return res.status(400).json({ error: 'One or more fields exceed the maximum length.' });
  }

  const emailBody = [
    `Name: ${name.trim()}`,
    `Email: ${email.trim()}`,
    phone ? `Phone: ${phone.trim()}` : null,
    '',
    'Message:',
    message.trim(),
  ]
    .filter((line) => line !== null)
    .join('\n');

  try {
    await ses.send(
      new SendEmailCommand({
        Source: SES_FROM_EMAIL,
        Destination: { ToAddresses: [SES_TO_EMAIL] },
        Message: {
          Subject: { Data: `New enquiry from ${name.trim().slice(0, 78)}`, Charset: 'UTF-8' },
          Body: { Text: { Data: emailBody, Charset: 'UTF-8' } },
        },
        ReplyToAddresses: [email.trim()],
      })
    );

    console.log(`Contact form submission from ${email.trim()}`);
    res.json({ success: true });
  } catch (err) {
    console.error('SES send error:', err.message);
    res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
});

// --- Chat AI ---
// Separate rate limiting for chat: 30/hr/IP
const chatRateLimitMap = new Map();
const CHAT_RATE_LIMIT_MAX = 30;
const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, entries] of chatRateLimitMap) {
    const valid = entries.filter((ts) => now - ts < CHAT_RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      chatRateLimitMap.delete(ip);
    } else {
      chatRateLimitMap.set(ip, valid);
    }
  }
}, 10 * 60 * 1000);

function checkChatRateLimit(ip) {
  const now = Date.now();
  const entries = (chatRateLimitMap.get(ip) || []).filter(
    (ts) => now - ts < CHAT_RATE_LIMIT_WINDOW_MS
  );
  if (entries.length >= CHAT_RATE_LIMIT_MAX) return false;
  entries.push(now);
  chatRateLimitMap.set(ip, entries);
  return true;
}

let openai;

app.post('/api/chat', async (req, res) => {
  if (!openai) {
    return res.status(503).json({ error: 'Chat service not available.' });
  }

  const clientIp = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip;
  if (!checkChatRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many messages. Please try again later.' });
  }

  const { sessionId, message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    const result = await chat(openai, {
      sessionId: sessionId || null,
      message,
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'] || '',
    });
    res.json(result);
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({
      error: 'Something went wrong. Please try again or call us on 086 872 9764.',
    });
  }
});

// --- Admin routes ---
mountAdminRoutes(app);

// --- Health check ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- Startup ---
function startup() {
  // Init SQLite
  try {
    initDb();
    console.log('Chat database initialized.');
  } catch (err) {
    console.error('Failed to initialize chat database:', err.message);
  }

  // Init OpenAI client
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('OpenAI client initialized.');
  } else {
    console.warn('OPENAI_API_KEY not set — chat endpoint disabled.');
  }
}

startup();

app.listen(PORT, () => {
  console.log(`Sandycove Music API listening on port ${PORT}`);
});
