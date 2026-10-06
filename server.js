'use strict';

/**
 * Northstar Capital — brokerage demo backend.
 * Express + SQLite (better-sqlite3). Serves the static frontend from public/
 * and exposes a small JSON API that mirrors the original broker-app artifact.
 *
 * API:
 *   POST /api/login            {email, password, role} -> {user, isAdmin}
 *   GET  /api/dashboard?user_id= -> {user, performance, transactions}
 *   GET  /api/market           -> {quotes, fetched_at} (CoinGecko, 60s cache)
 *   POST /api/movemoney        {user_id, type, amount, note?}
 *   GET  /api/users            -> [{...user, portfolio_value}]
 *   PUT  /api/users/:id        {name, email, plan, status, cash, invested, roi}
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const seed = require('./seed');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'broker.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'Starter Portfolio',
    status TEXT NOT NULL DEFAULT 'active',
    cash REAL NOT NULL DEFAULT 0,
    invested REAL NOT NULL DEFAULT 0,
    roi REAL NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    value REAL NOT NULL
  );
`);

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, plan, status, cash, invested, roi, is_admin, created_at, updated_at)
    VALUES (@id, @name, @email, @plan, @status, @cash, @invested, @roi, @is_admin, @created_at, @updated_at)
  `);
  const insertTx = db.prepare(`
    INSERT INTO transactions (user_id, type, amount, note, status, created_at)
    VALUES (@user_id, @type, @amount, @note, @status, @created_at)
  `);
  const insertPerf = db.prepare(`
    INSERT INTO performance (user_id, date, value) VALUES (@user_id, @date, @value)
  `);

  const seedAll = db.transaction(() => {
    for (const u of seed.USERS) insertUser.run(u);
    for (const t of seed.TRANSACTIONS_USER_1) insertTx.run({ user_id: 1, ...t });
    for (const p of seed.PERFORMANCE_USER_1) insertPerf.run({ user_id: 1, ...p });
    for (const [uid, hist] of Object.entries(seed.SAMPLE_HISTORIES)) {
      for (const t of hist.transactions) insertTx.run({ user_id: Number(uid), ...t });
      for (const p of hist.performance) insertPerf.run({ user_id: Number(uid), ...p });
    }
  });
  seedAll();
  console.log('Database seeded with', seed.USERS.length, 'users.');
}
seedIfEmpty();

// ---------- helpers ----------

function portfolioValue(u) {
  return u.cash + u.invested * (1 + u.roi / 100);
}

function publicUser(row) {
  if (!row) return null;
  const { is_admin, ...rest } = row;
  return { ...rest, is_admin: !!is_admin, portfolio_value: portfolioValue(row) };
}

function getUser(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row ? publicUser(row) : null;
}

const EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

// ---------- market data (CoinGecko, cached 60s) ----------

const COINS = [
  { key: 'btc', id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { key: 'eth', id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { key: 'sol', id: 'solana', symbol: 'SOL', name: 'Solana' },
  { key: 'xrp', id: 'ripple', symbol: 'XRP', name: 'XRP' },
  { key: 'ada', id: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { key: 'ltc', id: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
];

let marketCache = { at: 0, quotes: null };

async function fetchMarket() {
  const now = Date.now();
  if (marketCache.quotes && now - marketCache.at < 60_000) {
    return { quotes: marketCache.quotes, fetched_at: new Date(marketCache.at).toISOString(), cached: true };
  }
  try {
    const ids = COINS.map((c) => c.id).join(',');
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`,
      { headers: { 'User-Agent': 'northstar-broker-demo/1.0' }, signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    const byId = Object.fromEntries(data.map((d) => [d.id, d]));
    const quotes = COINS.map((c) => {
      const d = byId[c.id];
      if (!d) return null;
      return {
        key: c.key,
        symbol: c.symbol,
        name: c.name,
        price: d.current_price,
        change_percent: d.price_change_percentage_24h,
        high: d.high_24h,
        low: d.low_24h,
        currency: 'USD',
        as_of: d.last_updated,
        stale: false,
      };
    }).filter(Boolean);
    if (!quotes.length) throw new Error('empty CoinGecko response');
    marketCache = { at: now, quotes };
    return { quotes, fetched_at: new Date(now).toISOString(), cached: false };
  } catch (err) {
    if (marketCache.quotes) {
      return {
        quotes: marketCache.quotes.map((q) => ({ ...q, stale: true })),
        fetched_at: new Date(marketCache.at).toISOString(),
        cached: true,
        warning: 'Live quotes unavailable — showing last known prices.',
      };
    }
    // Cold-start fallback so the page never renders empty.
    const fallback = COINS.map((c) => ({
      key: c.key, symbol: c.symbol, name: c.name,
      price: null, change_percent: null, high: null, low: null,
      currency: 'USD', as_of: null, stale: true,
    }));
    return { quotes: fallback, fetched_at: new Date().toISOString(), cached: false, warning: 'Live quotes unavailable.' };
  }
}

// ---------- app ----------

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// POST /api/login — permissive: any email/password works.
app.post('/api/login', (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email))) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!password || String(password).length < 1) {
    return res.status(400).json({ error: 'A password is required.' });
  }
  if (role !== 'investor' && role !== 'admin') {
    return res.status(400).json({ error: 'Role must be investor or admin.' });
  }

  const now = new Date().toISOString();
  let row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);

  if (role === 'admin') {
    // Admin console: seeded admin, or any investor record elevated for the session.
    if (!row) {
      row = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@northstar.capital');
    }
    return res.json({ user: publicUser(row), isAdmin: true });
  }

  if (!row) {
    const info = db.prepare(`
      INSERT INTO users (name, email, plan, status, cash, invested, roi, is_admin, created_at, updated_at)
      VALUES (@name, @email, 'Starter Portfolio', 'active', 0, 0, 0, 0, @now, @now)
    `).run({ name: String(email).split('@')[0], email: String(email), now });
    row = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  res.json({ user: publicUser(row), isAdmin: !!row.is_admin });
});

// GET /api/dashboard?user_id=
app.get('/api/dashboard', (req, res) => {
  const userId = Number(req.query.user_id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'user_id is required.' });
  }
  const user = getUser(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const performance = db
    .prepare('SELECT date, value FROM performance WHERE user_id = ? ORDER BY date ASC')
    .all(userId);
  const transactions = db
    .prepare('SELECT id, type, amount, note, status, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .all(userId);
  res.json({ user, performance, transactions });
});

// GET /api/market
app.get('/api/market', async (req, res) => {
  res.json(await fetchMarket());
});

// POST /api/movemoney
app.post('/api/movemoney', (req, res) => {
  const { user_id, type, amount, note } = req.body || {};
  const userId = Number(user_id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'user_id is required.' });
  }
  if (type !== 'deposit' && type !== 'withdrawal') {
    return res.status(400).json({ error: 'type must be deposit or withdrawal.' });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0 || amt > 1_000_000) {
    return res.status(400).json({ error: 'amount must be greater than 0 and at most 1,000,000.' });
  }
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  if (type === 'withdrawal' && amt > row.cash) {
    return res.status(400).json({ error: 'Insufficient cash balance.' });
  }

  const now = new Date().toISOString();
  const newCash = type === 'deposit' ? row.cash + amt : row.cash - amt;
  const run = db.transaction(() => {
    db.prepare('UPDATE users SET cash = ?, updated_at = ? WHERE id = ?').run(newCash, now, userId);
    const tx = db.prepare(`
      INSERT INTO transactions (user_id, type, amount, note, status, created_at)
      VALUES (?, ?, ?, ?, 'completed', ?)
    `).run(userId, type, amt, note ? String(note).slice(0, 120) : (type === 'deposit' ? 'Deposit' : 'Withdrawal'), now);
    db.prepare('INSERT INTO performance (user_id, date, value) VALUES (?, ?, ?)').run(
      userId, now, newCash + row.invested * (1 + row.roi / 100)
    );
    return tx.lastInsertRowid;
  });
  const txId = run();
  const transaction = db.prepare('SELECT id, type, amount, note, status, created_at FROM transactions WHERE id = ?').get(txId);
  res.json({ user: getUser(userId), transaction });
});

// GET /api/users (admin list)
app.get('/api/users', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
  res.json({ users: rows.map(publicUser) });
});

// PUT /api/users/:id (admin edit) — mirrors the artifact's updateuser validation.
app.put('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'User not found.' });

  const { name, email, plan, status, cash, invested, roi } = req.body || {};
  const errors = [];
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) errors.push('name must be 2–80 characters.');
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) errors.push('email must be valid.');
  if (typeof plan !== 'string' || plan.trim().length < 2 || plan.trim().length > 80) errors.push('plan must be 2–80 characters.');
  if (!['active', 'review', 'suspended'].includes(status)) errors.push('status must be active, review or suspended.');
  const num = (v) => Number(v);
  if (!Number.isFinite(num(cash)) || num(cash) < 0 || num(cash) > 100_000_000) errors.push('cash must be 0–100,000,000.');
  if (!Number.isFinite(num(invested)) || num(invested) < 0 || num(invested) > 100_000_000) errors.push('invested must be 0–100,000,000.');
  if (!Number.isFinite(num(roi)) || num(roi) < -100 || num(roi) > 10000) errors.push('roi must be −100–10000.');
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const dupe = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(email, id);
  if (dupe) return res.status(400).json({ error: 'That email is already in use.' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users SET name = ?, email = ?, plan = ?, status = ?, cash = ?, invested = ?, roi = ?, updated_at = ?
    WHERE id = ?
  `).run(name.trim(), email.trim(), plan.trim(), status, num(cash), num(invested), num(roi), now, id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  db.prepare('INSERT INTO performance (user_id, date, value) VALUES (?, ?, ?)').run(id, now, portfolioValue(updated));
  res.json({ user: publicUser(updated) });
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`Northstar Capital broker app listening on port ${PORT}`);
});
