// server.js — Main Express server (Glitch + Render compatible)
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
const { initDb } = require('./db/init');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(morgan('dev'));

// ── Serve built frontend ───────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ─────────────────────────────────────────────────
app.use('/api/participants', require('./routes/participants'));
app.use('/api/checkin',      require('./routes/checkin'));
app.use('/api/guardians',    require('./routes/guardians'));
app.use('/api/logs',         require('./routes/logs'));
app.use('/api/staff',        require('./routes/staff'));
app.use('/api/dashboard',    require('./routes/dashboard'));

// ── Health check (also used by keep-alive ping) ────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── SPA fallback ───────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ── Error handler ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Keep-alive self-ping (prevents free-tier sleep) ───────────
// Set SELF_URL=https://your-app.glitch.me in your .env to activate
const SELF_URL = process.env.SELF_URL || '';
if (SELF_URL) {
  setInterval(() => {
    fetch(SELF_URL + '/api/health')
      .then(() => console.log('Keep-alive ping sent'))
      .catch(() => {});
  }, 4 * 60 * 1000); // every 4 minutes
}

// ── Boot ───────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`   App: http://localhost:${PORT}`);
    console.log(`   API: http://localhost:${PORT}/api/health\n`);
  });
}).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
