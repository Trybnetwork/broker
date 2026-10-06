# Northstar Capital — Broker App

A full-stack brokerage demo: investor login, portfolio dashboard with
performance chart, deposit/withdraw, live crypto market prices, and an admin
console for managing investors.

- **Backend:** Node.js + Express + SQLite (`better-sqlite3`)
- **Frontend:** plain HTML/CSS/JS in `public/` — no build step
- **Market data:** CoinGecko free public API (no key), cached 60 seconds server-side

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:3000.

The SQLite database is created on first boot at `data/broker.db` and seeded
with 5 investors plus an admin account:

| Login | Email | Role |
|---|---|---|
| Investor | `ronald@northstar.capital` | investor |
| Admin | `admin@northstar.capital` | admin |

Any email/password works — unknown emails sign in as a brand-new investor
with zero balances.

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/login` | `{email, password, role}` → `{user, isAdmin}` |
| GET | `/api/dashboard?user_id=` | user + portfolio value + performance + transactions |
| GET | `/api/market` | live crypto quotes (CoinGecko, 60s cache) |
| POST | `/api/movemoney` | `{user_id, type: deposit\|withdrawal, amount, note?}` |
| GET | `/api/users` | all investors (admin list) |
| PUT | `/api/users/:id` | update investor (admin edit) |

Portfolio value is computed as `cash + invested × (1 + roi/100)`.

## Deploy on Render (free)

1. Create an account at https://render.com (GitHub sign-in is easiest).
2. Dashboard → **New +** → **Web Service** → connect the `Trybnetwork/broker` repo.
3. Render reads `render.yaml` automatically: build `npm install`, start `npm start`.
4. Click **Create Web Service** and wait for the deploy to finish.
5. Open the service URL (e.g. `https://broker-app-xxxx.onrender.com`) — the
   frontend and API are served from the single URL.

> Note: on Render's free tier the filesystem is ephemeral, so the SQLite
> database resets whenever the service restarts or redeploys. That's fine for
> a demo. For persistent data, attach a Render Disk (paid) or switch the
> data layer to Postgres.
