// ─── Shared layout ────────────────────────────────────────────────────────────

// Escape HTML untuk mencegah XSS saat render user content di innerHTML
// Digunakan di semua tempat yang menampilkan data dari user (pesan, username, dll)
const escapeHtmlJs = `
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
`.trim();

function layout(title: string, body: string, extraHead = ""): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — YokMabar Admin</title>
  ${extraHead}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .nav { background: #1e2330; border-bottom: 1px solid #2d3748; padding: 0 1.5rem; display: flex; align-items: center; gap: 1.5rem; height: 52px; }
    .nav-brand { font-weight: 700; font-size: 1.1rem; color: #fff; margin-right: auto; }
    .nav a { color: #94a3b8; font-size: 0.9rem; padding: 0.25rem 0.5rem; border-radius: 6px; }
    .nav a:hover, .nav a.active { color: #fff; background: #2d3748; text-decoration: none; }
    .container { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; }
    h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; }
    .card { background: #1e2330; border: 1px solid #2d3748; border-radius: 10px; padding: 1.25rem; }
    .grid-4 { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .stat-card { background: #1e2330; border: 1px solid #2d3748; border-radius: 10px; padding: 1.25rem; }
    .stat-label { font-size: 0.78rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
    .stat-value { font-size: 1.75rem; font-weight: 700; color: #fff; }
    .stat-value.green { color: #34d399; }
    .stat-value.yellow { color: #fbbf24; }
    .stat-value.red { color: #f87171; }
    .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 1rem; border: none; border-radius: 7px; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
    .btn:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: #3b82f6; color: #fff; }
    .btn-success { background: #10b981; color: #fff; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-ghost { background: #2d3748; color: #e2e8f0; }
    .btn-sm { padding: 0.3rem 0.7rem; font-size: 0.8rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 0.6rem 0.75rem; font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #2d3748; }
    td { padding: 0.75rem; border-bottom: 1px solid #1a1f2e; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #252b3b; }
    .badge { display: inline-block; padding: 0.2rem 0.55rem; border-radius: 99px; font-size: 0.72rem; font-weight: 600; }
    .badge-green { background: #064e3b; color: #34d399; }
    .badge-red { background: #450a0a; color: #f87171; }
    .badge-yellow { background: #451a03; color: #fbbf24; }
    .badge-blue { background: #1e3a5f; color: #60a5fa; }
    .badge-gray { background: #1e293b; color: #94a3b8; }
    input, select, textarea { background: #0f1117; border: 1px solid #2d3748; border-radius: 7px; color: #e2e8f0; padding: 0.5rem 0.75rem; font-size: 0.875rem; width: 100%; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: #3b82f6; }
    label { display: block; font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.4rem; }
    .form-row { display: grid; gap: 1rem; margin-bottom: 1rem; }
    .form-row.cols-2 { grid-template-columns: 1fr 1fr; }
    .form-row.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
    .alert { padding: 0.75rem 1rem; border-radius: 7px; font-size: 0.875rem; margin-bottom: 1rem; }
    .alert-error { background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d; }
    .alert-success { background: #064e3b; color: #6ee7b7; border: 1px solid #065f46; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
    .gap-1 { gap: 0.5rem; }
    .flex { display: flex; }
    .mt-1 { margin-top: 1.5rem; }
    .text-sm { font-size: 0.8rem; color: #64748b; }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: #1e2330; border: 1px solid #2d3748; border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 480px; }
    .modal h2 { margin-bottom: 1.25rem; }
    .modal-footer { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.25rem; }
    .thread { display: flex; flex-direction: column; gap: 0.75rem; max-height: 340px; overflow-y: auto; margin: 1rem 0; }
    .bubble { max-width: 80%; padding: 0.65rem 0.9rem; border-radius: 10px; font-size: 0.875rem; line-height: 1.5; }
    .bubble-user { background: #2d3748; align-self: flex-start; border-bottom-left-radius: 2px; }
    .bubble-admin { background: #1e3a5f; align-self: flex-end; border-bottom-right-radius: 2px; }
    .bubble-meta { font-size: 0.7rem; color: #64748b; margin-top: 0.25rem; }
    #toast { position: fixed; bottom: 1.5rem; right: 1.5rem; background: #1e2330; border: 1px solid #2d3748; border-radius: 8px; padding: 0.75rem 1.25rem; font-size: 0.875rem; opacity: 0; transform: translateY(8px); transition: all 0.25s; pointer-events: none; z-index: 999; }
    #toast.show { opacity: 1; transform: translateY(0); }
  </style>
  <script>
  ${escapeHtmlJs}
  function toast(msg, ok = true) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.borderColor = ok ? '#065f46' : '#7f1d1d';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }
  async function apiFetch(url, opts = {}) {
    const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
    if (res.status === 401) { location.href = '/admin/login'; return null; }
    return res;
  }
  </script>
</head>
<body>
${body}
<div id="toast"></div>
</body>
</html>`;
}

// ─── Login Page ───────────────────────────────────────────────────────────────

export function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login — YokMabar Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .box { background: #1e2330; border: 1px solid #2d3748; border-radius: 12px; padding: 2rem; width: 100%; max-width: 380px; }
    h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem; }
    .sub { color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.4rem; }
    input { background: #0f1117; border: 1px solid #2d3748; border-radius: 7px; color: #e2e8f0; padding: 0.6rem 0.75rem; font-size: 0.9rem; width: 100%; margin-bottom: 1rem; }
    input:focus { outline: none; border-color: #3b82f6; }
    button { width: 100%; padding: 0.65rem; background: #3b82f6; color: #fff; border: none; border-radius: 7px; font-size: 0.9rem; font-weight: 600; cursor: pointer; margin-top: 0.5rem; }
    button:hover { background: #2563eb; }
    .err { background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d; padding: 0.65rem 0.9rem; border-radius: 7px; font-size: 0.875rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>YokMabar Admin</h1>
    <p class="sub">Masuk untuk melanjutkan</p>
    ${error ? `<div class="err">${error}</div>` : ""}
    <form id="form">
      <label>Username</label>
      <input type="text" name="username" autocomplete="username" required>
      <label>Password</label>
      <input type="password" name="password" autocomplete="current-password" required>
      <button type="submit" id="btn">Masuk</button>
    </form>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn');
      btn.disabled = true; btn.textContent = 'Memuat...';
      const fd = new FormData(e.target);
      const res = await fetch('/api/admin/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
      });
      if (res.ok) { location.href = '/admin'; }
      else {
        const data = await res.json();
        btn.disabled = false; btn.textContent = 'Masuk';
        document.querySelector('.err')?.remove();
        const err = document.createElement('div');
        err.className = 'err';
        err.textContent = data.message ?? 'Login gagal';
        e.target.insertBefore(err, e.target.firstChild);
      }
    });
  </script>
</body>
</html>`;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function nav(active: "dashboard" | "events" | "feedback"): string {
  const links = [
    { href: "/admin", label: "Dashboard", key: "dashboard" },
    { href: "/admin/events", label: "Events", key: "events" },
    { href: "/admin/feedback", label: "Feedback", key: "feedback" },
  ];
  return `<nav class="nav">
  <span class="nav-brand">YokMabar Admin</span>
  ${links.map(l => `<a href="${l.href}"${active === l.key ? ' class="active"' : ""}>${l.label}</a>`).join("")}
  <button onclick="logout()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:0.875rem;">Logout</button>
</nav>
<script>
async function logout() {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
  location.href = '/admin/login';
}
</script>`;
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function dashboardPage(): string {
  const body = `
${nav("dashboard")}
<div class="container">
  <h1>Dashboard</h1>
  <div class="grid-4" id="stats">
    ${["balance","totalOrders","successToday","pendingOrders","failedOrders","openTickets","activeEvents"].map(k => `
    <div class="stat-card">
      <div class="stat-label">${statLabel(k)}</div>
      <div class="stat-value ${statColor(k)}" id="stat-${k}">…</div>
    </div>`).join("")}
  </div>

  <div class="card">
    <div class="section-header">
      <h2>Sinkronisasi Harga</h2>
      <div class="flex gap-1">
        <span id="sync-status" class="text-sm"></span>
        <button class="btn btn-primary btn-sm" id="btn-sync" onclick="triggerSync()">Sync Sekarang</button>
      </div>
    </div>
    <p class="text-sm">Ambil harga terbaru dari Digiflazz dan perbarui database. Cooldown 15 menit.</p>
  </div>

  <div class="card mt-1">
    <div class="section-header">
      <h2>Riwayat Transaksi</h2>
      <div class="flex gap-1">
        <input type="text" id="order-search" placeholder="Cari ID / user / item…" style="width:200px" oninput="debounceSearch()">
        <select id="order-status" onchange="loadOrders(1)" style="width:auto">
          <option value="">Semua Status</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="PROCESSING">Processing</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILED">Failed</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>
    </div>
    <table>
      <thead>
        <tr><th>Order ID</th><th>Platform</th><th>User</th><th>Item</th><th>Harga</th><th>Status</th><th>Waktu</th></tr>
      </thead>
      <tbody id="orders-body">
        <tr><td colspan="7" class="text-sm" style="padding:1.5rem;text-align:center">Memuat…</td></tr>
      </tbody>
    </table>
    <div id="orders-pagination" class="flex gap-1" style="margin-top:1rem;justify-content:center"></div>
  </div>
</div>

<script>
async function loadStats() {
  const res = await apiFetch('/api/admin');
  if (!res) return;
  const d = await res.json();
  document.getElementById('stat-balance').textContent = d.balance !== null ? 'Rp\u00a0' + d.balance.balance.toLocaleString('id-ID') : '—';
  document.getElementById('stat-totalOrders').textContent = d.totalOrders;
  document.getElementById('stat-successToday').textContent = d.successToday;
  document.getElementById('stat-pendingOrders').textContent = d.pendingOrders;
  document.getElementById('stat-failedOrders').textContent = d.failedOrders;
  document.getElementById('stat-openTickets').textContent = d.openTickets;
  document.getElementById('stat-activeEvents').textContent = d.activeEvents;
}

async function loadSyncStatus() {
  const res = await apiFetch('/api/admin/sync/status');
  if (!res) return;
  const d = await res.json();
  const btn = document.getElementById('btn-sync');
  const status = document.getElementById('sync-status');
  if (d.cooldown > 0) {
    btn.disabled = true;
    status.textContent = 'Cooldown: ' + d.cooldown + 's';
    setTimeout(loadSyncStatus, 5000);
  } else {
    btn.disabled = false;
    status.textContent = '';
  }
}

async function triggerSync() {
  const btn = document.getElementById('btn-sync');
  btn.disabled = true;
  const res = await apiFetch('/api/admin/sync', { method: 'POST' });
  if (!res) return;
  if (res.ok) { toast('Sync dijadwalkan!'); loadSyncStatus(); }
  else { const d = await res.json(); toast(d.message ?? 'Gagal', false); btn.disabled = false; }
}

loadStats();
loadSyncStatus();
loadOrders(1);

let searchTimer;
function debounceSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadOrders(1), 400); }

const STATUS_BADGE = {
  SUCCESS: 'badge-green', FAILED: 'badge-red', EXPIRED: 'badge-red',
  PENDING: 'badge-yellow', PAID: 'badge-yellow', PROCESSING: 'badge-blue',
};
const PLATFORM_BADGE = { TELEGRAM: 'badge-blue', DISCORD: 'badge-yellow', WHATSAPP: 'badge-green' };

async function loadOrders(page) {
  const status = document.getElementById('order-status').value;
  const search = document.getElementById('order-search').value.trim();
  const params = new URLSearchParams({ page, ...(status ? { status } : {}), ...(search ? { search } : {}) });
  const res = await apiFetch('/api/admin/orders?' + params);
  if (!res) return;
  const d = await res.json();
  const tbody = document.getElementById('orders-body');
  if (d.orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-sm" style="padding:1.5rem;text-align:center">Tidak ada transaksi.</td></tr>';
    document.getElementById('orders-pagination').innerHTML = '';
    return;
  }
  tbody.innerHTML = d.orders.map(o => \`<tr>
    <td style="font-family:monospace;font-size:0.78rem">\${esc(o.id.slice(0,8))}…</td>
    <td><span class="badge \${PLATFORM_BADGE[o.user.platform] ?? 'badge-gray'}">\${o.user.platform}</span></td>
    <td class="text-sm">\${esc(o.user.username ?? o.user.platformUserId)}</td>
    <td class="text-sm">\${esc(o.itemName)}</td>
    <td class="text-sm">Rp \${o.amount.toLocaleString('id-ID')}</td>
    <td><span class="badge \${STATUS_BADGE[o.status] ?? 'badge-gray'}">\${o.status}</span></td>
    <td class="text-sm">\${new Date(o.createdAt).toLocaleString('id-ID')}</td>
  </tr>\`).join('');

  const pagination = document.getElementById('orders-pagination');
  if (d.pages <= 1) { pagination.innerHTML = ''; return; }
  let pages = '';
  for (let i = 1; i <= d.pages; i++) {
    pages += \`<button class="btn btn-sm \${i === d.page ? 'btn-primary' : 'btn-ghost'}" onclick="loadOrders(\${i})">\${i}</button>\`;
  }
  pagination.innerHTML = pages;
}
</script>`;
  return layout("Dashboard", body);
}

function statLabel(k: string): string {
  const map: Record<string, string> = {
    balance: "Saldo Digiflazz",
    totalOrders: "Total Order",
    successToday: "Sukses Hari Ini",
    pendingOrders: "Pending",
    failedOrders: "Gagal",
    openTickets: "Tiket Terbuka",
    activeEvents: "Event Aktif",
  };
  return map[k] ?? k;
}

function statColor(k: string): string {
  const map: Record<string, string> = {
    balance: "green",
    successToday: "green",
    failedOrders: "red",
    pendingOrders: "yellow",
  };
  return map[k] ?? "";
}

// ─── Events Page ──────────────────────────────────────────────────────────────

export function eventsPage(): string {
  const body = `
${nav("events")}
<div class="container">
  <div class="section-header">
    <h1>Price Events</h1>
    <button class="btn btn-primary" onclick="openModal()">+ Buat Event</button>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Nama</th><th>Scope</th><th>Display Markup</th><th>Actual Markup</th>
          <th>Status</th><th>Berakhir</th><th>Aksi</th>
        </tr>
      </thead>
      <tbody id="events-body">
        <tr><td colspan="7" class="text-sm" style="padding:1.5rem;text-align:center">Memuat…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<div class="modal-overlay" id="modal">
  <div class="modal" style="max-width:560px">
    <h2>Buat Price Event</h2>
    <div id="modal-err"></div>
    <div class="form-row cols-2">
      <div>
        <label>Nama Event</label>
        <input type="text" id="f-name" placeholder="Harbolnas 6.6">
      </div>
      <div>
        <label>Display Markup (fake %) — contoh: 14</label>
        <input type="number" id="f-display" step="1" min="1" max="100" placeholder="14">
      </div>
    </div>
    <div class="form-row cols-2">
      <div>
        <label>Scope</label>
        <select id="f-scope" onchange="onScopeChange()">
          <option value="ALL">Semua Game</option>
          <option value="BRAND">Brand Tertentu</option>
          <option value="ITEMS">Item Spesifik</option>
        </select>
      </div>
      <div id="scope-brand-wrap">
        <label>Brand</label>
        <select id="f-scope-brand" onchange="loadProductsForPicker()">
          <option value="">— pilih brand —</option>
        </select>
      </div>
    </div>

    <!-- Item picker (scope=ITEMS) -->
    <div id="items-picker-wrap" style="display:none;margin-bottom:1rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
        <label style="margin:0">Pilih Item yang Didiskon</label>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-sm" onclick="selectAllItems()">Pilih Semua</button>
          <button class="btn btn-ghost btn-sm" onclick="clearAllItems()">Batal Semua</button>
        </div>
      </div>
      <input type="text" id="item-search" placeholder="Cari nama item…" oninput="filterItems()" style="margin-bottom:0.5rem">
      <div id="items-list" style="max-height:220px;overflow-y:auto;background:#0f1117;border:1px solid #2d3748;border-radius:7px;padding:0.5rem">
        <div class="text-sm" style="padding:0.5rem">Pilih brand terlebih dahulu</div>
      </div>
      <div id="items-count" class="text-sm" style="margin-top:0.4rem"></div>
    </div>

    <div class="form-row">
      <div>
        <label>Berakhir Pada (opsional)</label>
        <input type="datetime-local" id="f-end-at">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Batal</button>
      <button class="btn btn-primary" id="btn-create" onclick="submitCreateEvent()">Buat</button>
    </div>
  </div>
</div>

<script>
let allProducts = [];
let selectedItemCodes = new Set();

async function loadBrands() {
  const res = await apiFetch('/api/admin/products/brands');
  if (!res) return;
  const brands = await res.json();
  const sel = document.getElementById('f-scope-brand');
  sel.innerHTML = '<option value="">— pilih brand —</option>' +
    brands.map(b => \`<option value="\${b}">\${b}</option>\`).join('');
}

async function loadProductsForPicker() {
  const brand = document.getElementById('f-scope-brand').value;
  if (!brand) return;
  const res = await apiFetch('/api/admin/products?brand=' + encodeURIComponent(brand));
  if (!res) return;
  allProducts = await res.json();
  selectedItemCodes.clear();
  renderItems(allProducts);
  updateCount();
}

function renderItems(list) {
  const el = document.getElementById('items-list');
  if (list.length === 0) {
    el.innerHTML = '<div class="text-sm" style="padding:0.5rem">Tidak ada produk.</div>';
    return;
  }
  // Group by category
  const groups = {};
  list.forEach(p => {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  });
  el.innerHTML = Object.entries(groups).map(([cat, items]) => \`
    <div style="margin-bottom:0.75rem">
      <div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;padding:0.25rem 0.4rem;margin-bottom:0.25rem">\${cat}</div>
      \${items.map(p => \`
        <label style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0.5rem;border-radius:6px;cursor:pointer;transition:background 0.1s" onmouseover="this.style.background='#1e2330'" onmouseout="this.style.background=''" data-name="\${p.itemName.toLowerCase()}">
          <input type="checkbox" value="\${p.itemCode}" onchange="toggleItem(this)" \${selectedItemCodes.has(p.itemCode) ? 'checked' : ''} style="width:auto;accent-color:#3b82f6">
          <span style="flex:1;font-size:0.85rem">\${p.itemName}</span>
          <span style="font-size:0.75rem;color:#64748b">Rp \${p.basePrice.toLocaleString('id-ID')}</span>
        </label>
      \`).join('')}
    </div>
  \`).join('');
}

function filterItems() {
  const q = document.getElementById('item-search').value.toLowerCase();
  const filtered = q ? allProducts.filter(p => p.itemName.toLowerCase().includes(q)) : allProducts;
  renderItems(filtered);
}

function toggleItem(cb) {
  if (cb.checked) selectedItemCodes.add(cb.value);
  else selectedItemCodes.delete(cb.value);
  updateCount();
}

function selectAllItems() {
  allProducts.forEach(p => selectedItemCodes.add(p.itemCode));
  renderItems(allProducts);
  updateCount();
}

function clearAllItems() {
  selectedItemCodes.clear();
  renderItems(allProducts);
  updateCount();
}

function updateCount() {
  document.getElementById('items-count').textContent =
    selectedItemCodes.size > 0 ? \`\${selectedItemCodes.size} item dipilih\` : '';
}

function onScopeChange() {
  const scope = document.getElementById('f-scope').value;
  const brandWrap = document.getElementById('scope-brand-wrap');
  const itemsWrap = document.getElementById('items-picker-wrap');
  brandWrap.style.opacity = scope === 'ALL' ? '0.3' : '1';
  itemsWrap.style.display = scope === 'ITEMS' ? 'block' : 'none';
  if (scope === 'ITEMS') loadBrands();
}
onScopeChange();

function openModal() { document.getElementById('modal').classList.add('open'); loadBrands(); }
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('modal-err').innerHTML = '';
  selectedItemCodes.clear();
  allProducts = [];
}

function badge(isActive) {
  return isActive ? '<span class="badge badge-green">Aktif</span>' : '<span class="badge badge-gray">Nonaktif</span>';
}

function scopeLabel(e) {
  if (e.scope === 'ALL') return 'Semua';
  if (e.scope === 'BRAND') return e.scopeValue ?? '—';
  if (e.scope === 'ITEMS') return \`\${e.scopeItemCodes?.length ?? 0} item\`;
  return '—';
}

async function loadEvents() {
  const res = await apiFetch('/api/admin/events');
  if (!res) return;
  const list = await res.json();
  const tbody = document.getElementById('events-body');
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-sm" style="padding:1.5rem;text-align:center">Belum ada event.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(e => \`<tr>
    <td style="font-weight:500">\${e.name}</td>
    <td>\${scopeLabel(e)}</td>
    <td>+\${Math.round(e.displayMarkupRate * 100)}%</td>
    <td>+\${Math.round(e.actualMarkupRate * 100)}%</td>
    <td>\${badge(e.isActive)}</td>
    <td class="text-sm">\${e.endAt ? new Date(e.endAt).toLocaleString('id-ID') : '—'}</td>
    <td>
      <div class="flex gap-1">
        \${e.isActive
          ? \`<button class="btn btn-ghost btn-sm" onclick="stopEvent('\${e.id}')">Stop</button>\`
          : \`<button class="btn btn-success btn-sm" onclick="startEvent('\${e.id}')">Start</button>\`}
        <button class="btn btn-danger btn-sm" onclick="deleteEvent('\${e.id}', '\${e.name}')">Hapus</button>
      </div>
    </td>
  </tr>\`).join('');
}

async function submitCreateEvent() {
  const btn = document.getElementById('btn-create');
  btn.disabled = true;
  const errEl = document.getElementById('modal-err');
  errEl.innerHTML = '';

  const scope = document.getElementById('f-scope').value;
  const scopeBrand = document.getElementById('f-scope-brand').value.trim();
  const endAt = document.getElementById('f-end-at').value;
  const displayRaw = parseFloat(document.getElementById('f-display').value);

  if (scope === 'ITEMS' && selectedItemCodes.size === 0) {
    errEl.innerHTML = '<div class="alert alert-error">Pilih minimal 1 item.</div>';
    btn.disabled = false;
    return;
  }
  if (scope === 'BRAND' && !scopeBrand) {
    errEl.innerHTML = '<div class="alert alert-error">Pilih brand terlebih dahulu.</div>';
    btn.disabled = false;
    return;
  }

  const body = {
    name: document.getElementById('f-name').value.trim(),
    displayMarkupRate: displayRaw / 100,
    scope,
    ...(scope === 'BRAND' ? { scopeValue: scopeBrand } : {}),
    ...(scope === 'ITEMS' ? { scopeItemCodes: [...selectedItemCodes] } : {}),
    ...(endAt ? { endAt: new Date(endAt).toISOString() } : {}),
  };

  const res = await apiFetch('/api/admin/events', { method: 'POST', body: JSON.stringify(body) });
  btn.disabled = false;
  if (!res) return;
  if (res.ok) { closeModal(); toast('Event berhasil dibuat!'); loadEvents(); }
  else {
    const d = await res.json();
    errEl.innerHTML = \`<div class="alert alert-error">\${d.message ?? 'Gagal membuat event'}</div>\`;
  }
}

async function startEvent(id) {
  const res = await apiFetch(\`/api/admin/events/\${id}/start\`, { method: 'PATCH' });
  if (res?.ok) { toast('Event dimulai!'); loadEvents(); }
}

async function stopEvent(id) {
  const res = await apiFetch(\`/api/admin/events/\${id}/stop\`, { method: 'PATCH' });
  if (res?.ok) { toast('Event dihentikan.'); loadEvents(); }
}

async function deleteEvent(id, name) {
  if (!confirm(\`Hapus event "\${name}"?\`)) return;
  const res = await apiFetch(\`/api/admin/events/\${id}\`, { method: 'DELETE' });
  if (res?.ok) { toast('Event dihapus.'); loadEvents(); }
}

loadEvents();
</script>`;
  return layout("Events", body);
}

// ─── Feedback Page ────────────────────────────────────────────────────────────

export function feedbackPage(): string {
  const body = `
${nav("feedback")}
<div class="container">
  <div class="section-header">
    <h1>Feedback</h1>
    <select id="filter" onchange="loadFeedback()" style="width:auto;padding:0.4rem 0.75rem">
      <option value="">Semua</option>
      <option value="OPEN" selected>Terbuka</option>
      <option value="REPLIED">Dibalas</option>
      <option value="CLOSED">Ditutup</option>
    </select>
  </div>

  <div class="card">
    <table>
      <thead>
        <tr><th>Tiket</th><th>Platform</th><th>User</th><th>Pesan</th><th>Status</th><th>Diperbarui</th><th>Aksi</th></tr>
      </thead>
      <tbody id="feedback-body">
        <tr><td colspan="7" class="text-sm" style="padding:1.5rem;text-align:center">Memuat…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- Thread Modal -->
<div class="modal-overlay" id="thread-modal">
  <div class="modal" style="max-width:560px">
    <div class="section-header">
      <h2 id="thread-title">Thread</h2>
      <button class="btn btn-danger btn-sm" id="btn-close-ticket" onclick="closeTicket()">Tutup Tiket</button>
    </div>
    <div class="thread" id="thread-messages"></div>
    <div id="reply-area">
      <textarea id="reply-text" rows="3" placeholder="Tulis balasan…" style="resize:vertical"></textarea>
      <div class="modal-footer" style="margin-top:0.75rem">
        <button class="btn btn-ghost" onclick="closeThreadModal()">Tutup</button>
        <button class="btn btn-primary" id="btn-reply" onclick="sendReply()">Kirim Balasan</button>
      </div>
    </div>
  </div>
</div>

<script>
let currentTicketId = null;

function statusBadge(s) {
  const map = { OPEN: 'badge-blue', REPLIED: 'badge-yellow', CLOSED: 'badge-gray' };
  return \`<span class="badge \${map[s] ?? 'badge-gray'}">\${s}</span>\`;
}

function platformBadge(p) {
  const map = { TELEGRAM: 'badge-blue', DISCORD: 'badge-yellow', WHATSAPP: 'badge-green' };
  return \`<span class="badge \${map[p] ?? 'badge-gray'}">\${p}</span>\`;
}

async function loadFeedback() {
  const status = document.getElementById('filter').value;
  const url = '/api/admin/feedback' + (status ? '?status=' + status : '');
  const res = await apiFetch(url);
  if (!res) return;
  const list = await res.json();
  const tbody = document.getElementById('feedback-body');
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-sm" style="padding:1.5rem;text-align:center">Tidak ada tiket.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(t => \`<tr>
    <td style="font-family:monospace;font-size:0.8rem">\${esc(t.ticketId)}</td>
    <td>\${platformBadge(t.user.platform)}</td>
    <td class="text-sm">\${esc(t.user.username ?? t.user.platformUserId)}</td>
    <td class="text-sm" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${esc(t.message)}</td>
    <td>\${statusBadge(t.status)}</td>
    <td class="text-sm">\${new Date(t.updatedAt).toLocaleString('id-ID')}</td>
    <td><button class="btn btn-ghost btn-sm" onclick="openThread('\${esc(t.ticketId)}')">Buka</button></td>
  </tr>\`).join('');
}

async function openThread(ticketId) {
  currentTicketId = ticketId;
  const res = await apiFetch('/api/admin/feedback/' + ticketId);
  if (!res) return;
  const t = await res.json();

  document.getElementById('thread-title').textContent = ticketId + ' — ' + (t.user.username ?? t.user.platformUserId);
  const closeBtn = document.getElementById('btn-close-ticket');
  closeBtn.style.display = t.status === 'CLOSED' ? 'none' : '';
  document.getElementById('reply-area').style.display = t.status === 'CLOSED' ? 'none' : '';

  const msgs = [{ message: t.message, fromAdmin: false, createdAt: t.createdAt }, ...t.replies];
  document.getElementById('thread-messages').innerHTML = msgs.map(m => \`
    <div>
      <div class="bubble \${m.fromAdmin ? 'bubble-admin' : 'bubble-user'}">\${esc(m.message)}</div>
      <div class="bubble-meta" style="text-align:\${m.fromAdmin ? 'right' : 'left'}">\${m.fromAdmin ? 'Admin' : 'User'} · \${new Date(m.createdAt).toLocaleString('id-ID')}</div>
    </div>
  \`).join('');

  document.getElementById('thread-modal').classList.add('open');
  const threadEl = document.getElementById('thread-messages');
  threadEl.scrollTop = threadEl.scrollHeight;
}

function closeThreadModal() {
  document.getElementById('thread-modal').classList.remove('open');
  currentTicketId = null;
}

async function sendReply() {
  if (!currentTicketId) return;
  const text = document.getElementById('reply-text').value.trim();
  if (!text) return;
  const btn = document.getElementById('btn-reply');
  btn.disabled = true;
  const res = await apiFetch('/api/admin/feedback/' + currentTicketId + '/reply', {
    method: 'POST', body: JSON.stringify({ message: text }),
  });
  btn.disabled = false;
  if (!res) return;
  if (res.ok) {
    document.getElementById('reply-text').value = '';
    toast('Balasan terkirim!');
    openThread(currentTicketId);
    loadFeedback();
  } else {
    const d = await res.json();
    toast(d.message ?? 'Gagal', false);
  }
}

async function closeTicket() {
  if (!currentTicketId) return;
  if (!confirm('Tutup tiket ' + currentTicketId + '?')) return;
  const res = await apiFetch('/api/admin/feedback/' + currentTicketId + '/close', { method: 'PATCH' });
  if (res?.ok) { toast('Tiket ditutup.'); closeThreadModal(); loadFeedback(); }
}

loadFeedback();
</script>`;
  return layout("Feedback", body);
}
