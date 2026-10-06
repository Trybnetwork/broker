'use strict';

const $ = (id) => document.getElementById(id);
const fmtMoney = (n) =>
  n == null || Number.isNaN(Number(n))
    ? '—'
    : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

let session = null; // {user, isAdmin}
let editingId = null;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function show(view) {
  ['view-login', 'view-dashboard', 'view-admin'].forEach((v) => $(v).classList.add('hidden'));
  $(view).classList.remove('hidden');
  window.scrollTo(0, 0);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- login ----------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const role = $('login-role').value;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    });
    session = data;
    if (data.isAdmin) {
      await loadAdmin();
      show('view-admin');
    } else {
      await loadDashboard(data.user.id);
      show('view-dashboard');
    }
  } catch (err) {
    $('login-error').textContent = err.message;
  }
});

function logout() {
  session = null;
  $('login-password').value = '';
  show('view-login');
}
$('btn-logout').addEventListener('click', logout);
$('btn-logout-admin').addEventListener('click', logout);

// ---------- investor dashboard ----------
async function loadDashboard(userId) {
  const { user, performance, transactions } = await api(`/api/dashboard?user_id=${userId}`);
  session.user = user;

  $('dash-username').textContent = user.name;
  $('dash-portfolio').textContent = fmtMoney(user.portfolio_value);
  $('dash-plan').textContent = user.plan;
  $('dash-status').innerHTML = `<span class="status-pill status-${user.status}">${user.status}</span>`;
  $('dash-cash').textContent = '$' + fmtMoney(user.cash);
  $('dash-invested').textContent = '$' + fmtMoney(user.invested);
  const roiEl = $('dash-roi');
  roiEl.textContent = `${Number(user.roi) >= 0 ? '+' : ''}${Number(user.roi).toFixed(2)}%`;
  roiEl.className = 'big ' + (Number(user.roi) >= 0 ? 'positive' : 'negative');
  $('dash-email').textContent = user.email;

  drawChart(performance);
  renderTransactions(transactions);
  loadMarket();
}

function renderTransactions(txs) {
  const ul = $('tx-list');
  ul.innerHTML = '';
  if (!txs.length) {
    ul.innerHTML = '<li class="tx-empty">No transactions yet.</li>';
    return;
  }
  for (const t of txs) {
    const incoming = t.type === 'deposit' || t.type === 'admin_adjustment';
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <div style="text-transform:capitalize;font-weight:600;">${escapeHtml(t.type.replace(/_/g, ' '))}</div>
        <div class="tx-meta">${escapeHtml(t.note || '')} · ${fmtDate(t.created_at)} · ${escapeHtml(t.status || '')}</div>
      </div>
      <div class="tx-amt ${incoming ? 'in' : 'out'}">${incoming ? '+' : '−'}$${fmtMoney(t.amount)}</div>`;
    ul.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- performance chart ----------
function drawChart(points) {
  const canvas = $('perfChart');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (!points || points.length < 2) {
    ctx.fillStyle = '#9aa3ad';
    ctx.font = '13px sans-serif';
    ctx.fillText('Not enough data to chart yet.', 12, h / 2);
    return;
  }

  const pad = { l: 8, r: 8, t: 14, b: 26 };
  const vals = points.map((p) => Number(p.value));
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;

  const x = (i) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);

  // gridlines
  ctx.strokeStyle = '#1d222a';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#6b7480';
  ctx.font = '10px sans-serif';
  for (let g = 0; g <= 3; g++) {
    const v = min + (span * 1.16 * g) / 3;
    const gy = pad.t + (1 - g / 3) * (h - pad.t - pad.b);
    ctx.beginPath();
    ctx.moveTo(pad.l, gy);
    ctx.lineTo(w - pad.r, gy);
    ctx.stroke();
    ctx.fillText('$' + compact(v), pad.l + 2, gy - 4);
  }

  // area fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  grad.addColorStop(0, 'rgba(201,162,75,0.35)');
  grad.addColorStop(1, 'rgba(201,162,75,0)');
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(Number(p.value))) : ctx.moveTo(x(i), y(Number(p.value)))));
  ctx.lineTo(x(points.length - 1), h - pad.b);
  ctx.lineTo(x(0), h - pad.b);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(Number(p.value))) : ctx.moveTo(x(i), y(Number(p.value)))));
  ctx.strokeStyle = '#c9a24b';
  ctx.lineWidth = 2;
  ctx.stroke();

  // dots + date labels
  ctx.fillStyle = '#c9a24b';
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(Number(p.value)), 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#6b7480';
  const step = Math.max(1, Math.floor(points.length / 5));
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      ctx.fillText(fmtDate(p.date).replace(', 2026', ''), x(i) - 14, h - 8);
    }
  });
}

function compact(v) {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

// ---------- move money ----------
async function moveMoney(type) {
  const input = type === 'deposit' ? $('deposit-amount') : $('withdraw-amount');
  const msg = type === 'deposit' ? $('deposit-msg') : $('withdraw-msg');
  msg.className = 'money-msg';
  msg.textContent = '';
  const amount = Number(input.value);
  if (!amount || amount <= 0) {
    msg.classList.add('err');
    msg.textContent = 'Enter an amount greater than 0.';
    return;
  }
  try {
    const { user, transaction } = await api('/api/movemoney', {
      method: 'POST',
      body: JSON.stringify({ user_id: session.user.id, type, amount }),
    });
    session.user = user;
    input.value = '';
    msg.classList.add('ok');
    msg.textContent = `${type === 'deposit' ? 'Deposited' : 'Withdrew'} $${fmtMoney(transaction.amount)}.`;
    await loadDashboard(user.id);
  } catch (err) {
    msg.classList.add('err');
    msg.textContent = err.message;
  }
}
$('btn-deposit').addEventListener('click', () => moveMoney('deposit'));
$('btn-withdraw').addEventListener('click', () => moveMoney('withdrawal'));

// ---------- market ----------
async function loadMarket() {
  const strip = $('market-strip');
  try {
    const { quotes, warning } = await api('/api/market');
    strip.innerHTML = '';
    for (const q of quotes) {
      const div = document.createElement('div');
      div.className = 'coin';
      const chg = q.change_percent;
      div.innerHTML = `
        <div class="sym">${escapeHtml(q.symbol)}</div>
        <div class="nm">${escapeHtml(q.name)}</div>
        <div class="px">${q.price != null ? '$' + fmtMoney(q.price) : '—'}</div>
        <div class="ch ${chg == null ? '' : chg >= 0 ? 'positive' : 'negative'}">
          ${chg == null ? 'n/a' : (chg >= 0 ? '+' : '') + chg.toFixed(2) + '% 24h'}${q.stale ? ' · stale' : ''}
        </div>`;
      strip.appendChild(div);
    }
    $('market-updated').textContent = '· live via CoinGecko';
    $('market-note').textContent = warning || 'Prices refresh every 60 seconds. Reference only.';
  } catch {
    strip.innerHTML = '<div class="tx-empty">Market data unavailable.</div>';
  }
}

// ---------- admin ----------
async function loadAdmin() {
  const { users } = await api('/api/users');
  $('admin-count').textContent = `· ${users.length} accounts`;
  const tb = $('admin-tbody');
  tb.innerHTML = '';
  for (const u of users) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(u.name)}</strong>${u.is_admin ? ' <span class="status-pill status-review">admin</span>' : ''}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(u.plan)}</td>
      <td><span class="status-pill status-${u.status}">${u.status}</span></td>
      <td>$${fmtMoney(u.cash)}</td>
      <td>$${fmtMoney(u.invested)}</td>
      <td class="${Number(u.roi) >= 0 ? 'positive' : 'negative'}">${Number(u.roi).toFixed(2)}%</td>
      <td><strong>$${fmtMoney(u.portfolio_value)}</strong></td>
      <td>${u.is_admin ? '' : `<button class="btn btn-sm" data-edit="${u.id}">Edit</button>`}</td>`;
    tb.appendChild(tr);
  }
  tb.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openEdit(Number(b.dataset.edit)))
  );
}

async function openEdit(id) {
  const { users } = await api('/api/users');
  const u = users.find((x) => x.id === id);
  if (!u) return;
  editingId = id;
  $('edit-name').value = u.name;
  $('edit-email').value = u.email;
  $('edit-plan').value = u.plan;
  $('edit-status').value = u.status;
  $('edit-cash').value = u.cash;
  $('edit-invested').value = u.invested;
  $('edit-roi').value = u.roi;
  $('edit-error').textContent = '';
  $('edit-modal').classList.remove('hidden');
}
$('edit-cancel').addEventListener('click', () => $('edit-modal').classList.add('hidden'));
$('edit-modal').addEventListener('click', (e) => {
  if (e.target === $('edit-modal')) $('edit-modal').classList.add('hidden');
});

$('edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('edit-error').textContent = '';
  const body = {
    name: $('edit-name').value.trim(),
    email: $('edit-email').value.trim(),
    plan: $('edit-plan').value.trim(),
    status: $('edit-status').value,
    cash: Number($('edit-cash').value),
    invested: Number($('edit-invested').value),
    roi: Number($('edit-roi').value),
  };
  try {
    await api(`/api/users/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
    $('edit-modal').classList.add('hidden');
    toast('Investor updated.');
    await loadAdmin();
  } catch (err) {
    $('edit-error').textContent = err.message;
  }
});
