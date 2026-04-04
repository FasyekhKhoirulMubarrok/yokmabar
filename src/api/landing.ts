import { Hono } from "hono";
import { config } from "../config.js";

const landing = new Hono();

// ─── Shared ───────────────────────────────────────────────────────────────────

const APP_NAME = config.APP_NAME ?? "YokMabar";
const APP_URL = config.APP_URL ?? "https://yokmabar.com";
const DISCORD_SERVER_URL = "https://discord.gg/QSbSBBQ3C8";
const DISCORD_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${config.DISCORD_CLIENT_ID}&scope=bot+applications.commands&permissions=277025392640`;

function discordDropdownBtn(extraClass = ""): string {
  return `
<div class="discord-dropdown">
  <button class="btn btn-outline${extraClass ? " " + extraClass : ""}" onclick="toggleDiscordDropdown(this)">🎮 Discord ▾</button>
  <div class="discord-dropdown-menu">
    <a href="${DISCORD_SERVER_URL}" target="_blank" rel="noopener">
      <span class="dd-icon">🎮</span>
      <div class="dd-label">
        <strong>Gabung Server YokMabar</strong>
        <span>Bergabung ke komunitas gamer kami</span>
      </div>
    </a>
    <a href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener">
      <span class="dd-icon">🤖</span>
      <div class="dd-label">
        <strong>Invite Bot ke Servermu</strong>
        <span>Tambahkan YokMabar Bot ke server Discord-mu</span>
      </div>
    </a>
  </div>
</div>`;
}

function landingLayout(title: string, description: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${APP_URL}">
  <meta property="og:image" content="${APP_URL}/images/logo-full.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <link rel="icon" type="image/png" href="/images/logo-emblem.png">
  <link rel="canonical" href="${APP_URL}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --primary: #f7c102;
      --primary-dark: #d9a900;
      --primary-glow: rgba(247,193,2,.18);
      --primary-glow-border: rgba(247,193,2,.35);
      --bg: #0a0a0a;
      --bg2: #111111;
      --bg3: #181818;
      --card: #161616;
      --border: #262626;
      --text: #f0f0f0;
      --muted: #888888;
      --radius: 12px;
    }

    html { scroll-behavior: smooth; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; }

    /* Nav */
    .nav {
      position: sticky; top: 0; z-index: 100;
      background: rgba(10,10,10,0.88); backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--border);
      padding: 0 1.5rem; height: 60px;
      display: flex; align-items: center; gap: 1.5rem;
    }
    .nav-brand { display: flex; align-items: center; gap: 0.6rem; margin-right: auto; }
    .nav-brand img { height: 32px; width: auto; }
    .nav-brand span { font-weight: 800; font-size: 1.15rem; color: #fff; }
    .nav-links { display: flex; gap: 0.25rem; }
    .nav-links a { color: var(--muted); font-size: 0.9rem; padding: 0.4rem 0.75rem; border-radius: 8px; transition: all .15s; }
    .nav-links a:hover { color: #fff; background: var(--card); text-decoration: none; }
    .nav-cta { background: var(--primary); color: #000 !important; border-radius: 8px; padding: 0.4rem 1rem !important; font-weight: 700; transition: all .15s; }
    .nav-cta:hover { background: var(--primary-dark) !important; text-decoration: none; transform: translateY(-1px); }

    /* Hero */
    .hero {
      min-height: 92vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center; padding: 5rem 1.5rem 4rem;
      background: radial-gradient(ellipse 80% 55% at 50% 0%, var(--primary-glow) 0%, transparent 70%);
    }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 0.4rem;
      background: var(--primary-glow); border: 1px solid var(--primary-glow-border);
      color: var(--primary); font-size: 0.82rem; font-weight: 700;
      padding: 0.3rem 0.9rem; border-radius: 999px; margin-bottom: 1.5rem;
      letter-spacing: .04em; text-transform: uppercase;
    }
    .hero h1 {
      font-size: clamp(2.2rem, 6vw, 4rem); font-weight: 800;
      line-height: 1.1; margin-bottom: 1.25rem; color: #fff;
    }
    .hero h1 .highlight { color: var(--primary); }
    .hero p { font-size: clamp(1rem, 2vw, 1.2rem); color: var(--muted); max-width: 520px; margin-bottom: 2.5rem; }
    .hero-actions { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }
    .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.75rem; border-radius: var(--radius); font-weight: 700; font-size: 1rem; transition: all .15s; cursor: pointer; border: none; }
    .btn-primary { background: var(--primary); color: #000; }
    .btn-primary:hover { background: var(--primary-dark); text-decoration: none; color: #000; transform: translateY(-1px); box-shadow: 0 8px 28px rgba(247,193,2,.3); }
    .btn-outline { background: transparent; color: var(--text); border: 1.5px solid var(--border); }
    .btn-outline:hover { border-color: var(--primary); color: var(--primary); text-decoration: none; }
    .hero-img { margin-top: 4rem; }
    .hero-img img { height: 80px; width: auto; opacity: .9; filter: drop-shadow(0 0 18px rgba(247,193,2,.25)); }

    /* Platforms */
    .platforms { padding: 5rem 1.5rem; background: var(--bg2); }
    .section-label { text-align: center; font-size: 0.75rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--primary); margin-bottom: 1rem; }
    .section-title { text-align: center; font-size: clamp(1.5rem, 3vw, 2.2rem); font-weight: 800; color: #fff; margin-bottom: 0.75rem; }
    .section-sub { text-align: center; color: var(--muted); max-width: 480px; margin: 0 auto 3rem; }
    .platform-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; max-width: 900px; margin: 0 auto; }
    .platform-card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 2rem 1.5rem; text-align: center;
    }
    .platform-icon { font-size: 2.5rem; margin-bottom: 1rem; }
    .platform-card h3 { font-size: 1.1rem; font-weight: 700; color: #fff; margin-bottom: 0.4rem; }
    .platform-card p { color: var(--muted); font-size: 0.9rem; }

    /* Tutorial */
    .tutorial { padding: 5rem 1.5rem; }
    .tutorial-tabs { display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 2.5rem; }
    .tab-btn {
      padding: 0.55rem 1.4rem; border-radius: 999px; font-size: 0.9rem; font-weight: 700;
      border: 1.5px solid var(--border); background: transparent; color: var(--muted);
      cursor: pointer; transition: all .15s;
    }
    .tab-btn.active { background: var(--primary); border-color: var(--primary); color: #000; }
    .tab-btn:not(.active):hover { border-color: var(--primary); color: var(--primary); }
    .tab-panel { display: none; max-width: 680px; margin: 0 auto; }
    .tab-panel.active { display: block; }
    .steps { display: flex; flex-direction: column; gap: 1rem; }
    .step {
      display: flex; gap: 1rem; align-items: flex-start;
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 1.25rem 1.5rem;
    }
    .step-num {
      flex-shrink: 0; width: 2rem; height: 2rem; border-radius: 50%;
      background: var(--primary); color: #000; font-weight: 800; font-size: 0.85rem;
      display: flex; align-items: center; justify-content: center; margin-top: 0.1rem;
    }
    .step-body h4 { font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 0.25rem; }
    .step-body p { font-size: 0.875rem; color: var(--muted); }
    .step-body code { background: var(--bg3); border: 1px solid var(--border); padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.82rem; color: var(--primary); }

    /* Features */
    .features { padding: 5rem 1.5rem; }
    .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem; max-width: 1000px; margin: 0 auto; }
    .feature-item {
      display: flex; gap: 1rem; align-items: flex-start;
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 1.5rem;
      transition: border-color .2s;
    }
    .feature-item:hover { border-color: var(--border); border-left: 3px solid var(--primary); }
    .feature-icon { font-size: 1.5rem; flex-shrink: 0; margin-top: 0.1rem; }
    .feature-item h3 { font-size: 1rem; font-weight: 700; color: #fff; margin-bottom: 0.3rem; }
    .feature-item p { color: var(--muted); font-size: 0.875rem; }

    /* Games */
    .games { padding: 5rem 1.5rem; background: var(--bg2); }
    .games-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; max-width: 700px; margin: 0 auto; }
    .game-tag {
      background: var(--bg3); border: 1px solid var(--border); border-radius: 999px;
      padding: 0.5rem 1.2rem; font-size: 0.9rem; font-weight: 500; color: var(--text);
      transition: all .15s;
    }
    .game-tag:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-glow); }

    /* CTA */
    .cta {
      padding: 6rem 1.5rem; text-align: center;
      background: radial-gradient(ellipse 70% 80% at 50% 100%, var(--primary-glow) 0%, transparent 70%);
    }
    .cta h2 { font-size: clamp(1.8rem, 4vw, 2.8rem); font-weight: 800; color: #fff; margin-bottom: 1rem; }
    .cta p { color: var(--muted); max-width: 440px; margin: 0 auto 2.5rem; font-size: 1.05rem; }
    .cta-buttons { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }

    /* Footer */
    .footer { background: var(--bg2); border-top: 1px solid var(--border); padding: 3rem 1.5rem 2rem; }
    .footer-inner { max-width: 1000px; margin: 0 auto; display: grid; grid-template-columns: 1fr auto; gap: 2rem; align-items: start; }
    .footer-brand { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem; }
    .footer-brand img { height: 28px; width: auto; }
    .footer-brand span { font-weight: 800; color: var(--primary); }
    .footer-desc { color: var(--muted); font-size: 0.875rem; max-width: 300px; }
    .footer-links { display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-end; }
    .footer-links a { color: var(--muted); font-size: 0.875rem; }
    .footer-links a:hover { color: var(--primary); }
    .footer-bottom { max-width: 1000px; margin: 2rem auto 0; padding-top: 1.5rem; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; color: var(--muted); font-size: 0.8rem; }

    /* Prose (terms/privacy) */
    .prose { max-width: 760px; margin: 0 auto; padding: 3rem 1.5rem 5rem; }
    .prose h1 { font-size: 1.8rem; font-weight: 800; color: #fff; margin-bottom: 0.5rem; }
    .prose .updated { color: var(--muted); font-size: 0.875rem; margin-bottom: 2.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
    .prose h2 { font-size: 1.1rem; font-weight: 700; color: var(--primary); margin: 2rem 0 0.75rem; }
    .prose p { color: var(--muted); margin-bottom: 1rem; }
    .prose ul, .prose ol { color: var(--muted); padding-left: 1.5rem; margin-bottom: 1rem; }
    .prose li { margin-bottom: 0.3rem; }
    .prose a { color: var(--primary); }
    .prose strong { color: var(--text); }

    /* Discord Dropdown */
    .discord-dropdown { position: relative; display: inline-flex; }
    .discord-dropdown-menu {
      display: none; position: absolute; top: calc(100% + 8px); left: 50%;
      transform: translateX(-50%); min-width: 260px; z-index: 200;
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden;
      box-shadow: 0 12px 36px rgba(0,0,0,.5);
    }
    .discord-dropdown-menu.open { display: block; }
    .discord-dropdown-menu a {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.85rem 1rem; color: var(--text);
      transition: background .15s; text-decoration: none;
      border-bottom: 1px solid var(--border);
    }
    .discord-dropdown-menu a:last-child { border-bottom: none; }
    .discord-dropdown-menu a:hover { background: var(--bg3); text-decoration: none; }
    .discord-dropdown-menu .dd-icon { font-size: 1.4rem; flex-shrink: 0; }
    .discord-dropdown-menu .dd-label strong { display: block; font-size: 0.9rem; font-weight: 700; color: #fff; margin-bottom: 0.1rem; }
    .discord-dropdown-menu .dd-label span { font-size: 0.78rem; color: var(--muted); }

    @media (max-width: 640px) {
      .nav-links { display: none; }
      .footer-inner { grid-template-columns: 1fr; }
      .footer-links { align-items: flex-start; }
      .footer-bottom { flex-direction: column; align-items: flex-start; }
      .discord-dropdown-menu { left: 0; transform: none; }
    }
  </style>
</head>
<body>
  ${body}
<script>
  function toggleDiscordDropdown(btn) {
    const menu = btn.nextElementSibling;
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.discord-dropdown-menu.open').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
  }
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.discord-dropdown')) {
      document.querySelectorAll('.discord-dropdown-menu.open').forEach(m => m.classList.remove('open'));
    }
  });
  function switchTab(platform) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + platform).classList.add('active');
    event.currentTarget.classList.add('active');
  }
</script>
</body>
</html>`;
}

const NAV = `
<nav class="nav">
  <div class="nav-brand">
    <img src="/images/logo-emblem.png" alt="${APP_NAME} logo" onerror="this.style.display='none'">
    <span>${APP_NAME}</span>
  </div>
  <div class="nav-links">
    <a href="/#platform">Platform</a>
    <a href="/#cara-pakai">Cara Pakai</a>
    <a href="/#fitur">Fitur</a>
    <a href="/#game">Game</a>
    <a href="/terms">Syarat</a>
    <a href="/privacy">Privasi</a>
  </div>
  <a href="https://t.me/yokmabarbot" class="btn btn-primary nav-cta" target="_blank" rel="noopener">Top Up Sekarang</a>
</nav>
`;

const FOOTER = `
<footer class="footer">
  <div class="footer-inner">
    <div>
      <div class="footer-brand">
        <img src="/images/logo-emblem.png" alt="${APP_NAME}" onerror="this.style.display='none'">
        <span>${APP_NAME}</span>
      </div>
      <p class="footer-desc">Top up game cepat, langsung dari chat — tanpa perlu buka web atau aplikasi tambahan.</p>
    </div>
    <div class="footer-links">
      <a href="/#platform">Platform</a>
      <a href="/#cara-pakai">Cara Pakai</a>
      <a href="/#fitur">Fitur</a>
      <a href="/#game">Game</a>
      <a href="/terms">Syarat & Ketentuan</a>
      <a href="/privacy">Kebijakan Privasi</a>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© ${new Date().getFullYear()} ${APP_NAME}. Semua hak dilindungi.</span>
    <span>Dibuat dengan ❤️ untuk para gamer Indonesia</span>
  </div>
</footer>
`;

// ─── GET / — Landing Page ─────────────────────────────────────────────────────

landing.get("/", (c) => {
  const body = `
${NAV}

<!-- Hero -->
<section class="hero">
  <div class="hero-badge">⚡ Top up instan, langsung di chat</div>
  <h1>Top Up Game Kamu<br>Langsung dari <span class="highlight">Chat</span></h1>
  <p>Tanpa buka web, tanpa ribet. Top up Mobile Legends, Free Fire, dan puluhan game lain lewat Telegram atau Discord — dalam hitungan menit.</p>
  <div class="hero-actions">
    <a href="https://t.me/yokmabarbot" class="btn btn-primary" target="_blank" rel="noopener">✈️ Mulai di Telegram</a>
    ${discordDropdownBtn()}
  </div>
  <div class="hero-img">
    <img src="/images/logo-full.png" alt="${APP_NAME}" onerror="this.style.display='none'">
  </div>
</section>

<!-- Platforms -->
<section class="platforms" id="platform">
  <p class="section-label">Platform</p>
  <h2 class="section-title">Top Up di Mana Aja</h2>
  <p class="section-sub">Pilih platform favoritmu — semua pengalaman sama cepatnya.</p>
  <div class="platform-cards">
    <div class="platform-card">
      <div class="platform-icon">✈️</div>
      <h3>Telegram</h3>
      <p>Inline keyboard interaktif. Tap, pilih, bayar — selesai dalam 1 menit.</p>
    </div>
    <div class="platform-card">
      <div class="platform-icon">🎮</div>
      <h3>Discord</h3>
      <p>Slash command <code>/topup</code> dengan autocomplete. Langsung dari server gaming kamu.</p>
    </div>
    <!--
    <div class="platform-card">
      <div class="platform-icon">💬</div>
      <h3>WhatsApp</h3>
      <p>Menu bernomor yang simpel. Cocok untuk siapa saja, tanpa perlu install app baru.</p>
    </div>
    -->
  </div>
</section>

<!-- Tutorial -->
<section class="tutorial" id="cara-pakai">
  <p class="section-label">Cara Pakai</p>
  <h2 class="section-title">Mulai Top Up dalam 3 Langkah</h2>
  <p class="section-sub">Pilih platform kamu dan ikuti langkah berikut — selesai dalam hitungan menit.</p>
  <div class="tutorial-tabs">
    <button class="tab-btn active" onclick="switchTab('telegram')">✈️ Telegram</button>
    <button class="tab-btn" onclick="switchTab('discord')">🎮 Discord</button>
  </div>

  <div id="tab-telegram" class="tab-panel active">
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-body">
          <h4>Buka bot di Telegram</h4>
          <p>Cari <code>@yokmabarbot</code> di Telegram atau langsung klik tombol "Mulai di Telegram" di atas.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-body">
          <h4>Ketik /topup</h4>
          <p>Pilih game dari daftar yang muncul, atau tap <code>🔍 Cari game lain</code> jika gamenya tidak ada di daftar utama.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-body">
          <h4>Pilih nominal & masukkan ID game</h4>
          <p>Tap nominal yang kamu mau, lalu masukkan User ID game kamu. Bot akan tampilkan konfirmasi sebelum lanjut.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-body">
          <h4>Bayar & selesai</h4>
          <p>Pilih metode pembayaran (QRIS, GoPay, OVO, Dana, atau transfer bank), selesaikan pembayaran, dan item langsung masuk ke akun game kamu.</p>
        </div>
      </div>
    </div>
  </div>

  <div id="tab-discord" class="tab-panel">
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-body">
          <h4>Invite bot atau gabung server</h4>
          <p>Tambahkan YokMabar Bot ke server Discord kamu, atau gabung ke server komunitas YokMabar lewat tombol Discord di atas.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-body">
          <h4>Ketik /topup</h4>
          <p>Gunakan slash command <code>/topup</code> di channel manapun. Autocomplete akan muncul untuk membantu pilih game dan nominal.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-body">
          <h4>Isi User ID di form popup</h4>
          <p>Setelah pilih game dan nominal, sebuah form kecil akan muncul. Masukkan User ID dan Server ID game kamu di sana.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-body">
          <h4>Konfirmasi & bayar</h4>
          <p>Cek detail pesanan di embed konfirmasi, pilih metode bayar, selesaikan pembayaran. Item masuk otomatis — semua pesan hanya terlihat oleh kamu.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- Features -->
<section class="features" id="fitur">
  <p class="section-label">Keunggulan</p>
  <h2 class="section-title">Kenapa Pilih ${APP_NAME}?</h2>
  <p class="section-sub">Dirancang untuk kecepatan dan kemudahan — dari gamer, untuk gamer.</p>
  <div class="feature-grid">
    <div class="feature-item">
      <div class="feature-icon">⚡</div>
      <div>
        <h3>Proses Instan</h3>
        <p>Item masuk ke akun game kamu dalam hitungan detik setelah pembayaran dikonfirmasi.</p>
      </div>
    </div>
    <div class="feature-item">
      <div class="feature-icon">🔒</div>
      <div>
        <h3>Pembayaran Aman</h3>
        <p>Didukung Midtrans — QRIS, GoPay, OVO, Dana, dan transfer bank tersedia.</p>
      </div>
    </div>
    <div class="feature-item">
      <div class="feature-icon">🎁</div>
      <div>
        <h3>Sistem Poin</h3>
        <p>Setiap transaksi mengumpulkan poin. Tukar poin untuk diskon di transaksi berikutnya.</p>
      </div>
    </div>
    <div class="feature-item">
      <div class="feature-icon">🔥</div>
      <div>
        <h3>Event Diskon</h3>
        <p>Promo berkala untuk game-game populer. Harga lebih murah, langsung terlihat saat checkout.</p>
      </div>
    </div>
    <div class="feature-item">
      <div class="feature-icon">🆔</div>
      <div>
        <h3>Validasi ID Otomatis</h3>
        <p>ID game dicek sebelum transaksi untuk Free Fire dan Mobile Legends — tidak perlu khawatir salah kirim.</p>
      </div>
    </div>
    <div class="feature-item">
      <div class="feature-icon">📋</div>
      <div>
        <h3>Riwayat Transaksi</h3>
        <p>Cek 5 transaksi terakhir kapan saja langsung dari chat bot.</p>
      </div>
    </div>
  </div>
</section>

<!-- Games -->
<section class="games" id="game">
  <p class="section-label">Game Tersedia</p>
  <h2 class="section-title">Ratusan Produk, Puluhan Game</h2>
  <p class="section-sub">Dari game mobile populer hingga PC — semua ada di ${APP_NAME}.</p>
  <div class="games-grid">
    <span class="game-tag">⚔️ Mobile Legends</span>
    <span class="game-tag">🔥 Free Fire</span>
    <span class="game-tag">🌍 Genshin Impact</span>
    <span class="game-tag">🚀 Honkai: Star Rail</span>
    <span class="game-tag">🎯 PUBG Mobile</span>
    <span class="game-tag">🎮 Valorant</span>
    <span class="game-tag">🏆 Call of Duty Mobile</span>
    <span class="game-tag">⚡ Clash of Clans</span>
    <span class="game-tag">🦸 Marvel Rivals</span>
    <span class="game-tag">🎲 Ragnarok Origin</span>
    <span class="game-tag">+ Masih banyak lagi</span>
  </div>
</section>

<!-- CTA -->
<section class="cta">
  <h2>Siap Top Up Sekarang?</h2>
  <p>Mulai dari bot favoritmu — gratis, tanpa daftar, langsung gas!</p>
  <div class="cta-buttons">
    <a href="https://t.me/yokmabarbot" class="btn btn-primary" target="_blank" rel="noopener">✈️ Buka Telegram</a>
    ${discordDropdownBtn()}
  </div>
</section>

${FOOTER}
`;

  return c.html(landingLayout(
    `${APP_NAME} — Top Up Game Cepat & Mudah`,
    "Top up Mobile Legends, Free Fire, Genshin Impact, dan game lainnya langsung dari Telegram atau Discord. Cepat, aman, tanpa ribet.",
    body,
  ));
});

// ─── GET /terms — Syarat & Ketentuan ─────────────────────────────────────────

landing.get("/terms", (c) => {
  const body = `
${NAV}
<div class="prose">
  <h1>Syarat &amp; Ketentuan</h1>
  <p class="updated">Terakhir diperbarui: 1 Januari 2025</p>

  <p>Dengan menggunakan layanan ${APP_NAME} ("kami", "layanan"), kamu menyetujui syarat dan ketentuan berikut. Harap baca dengan seksama sebelum menggunakan layanan.</p>

  <h2>1. Layanan</h2>
  <p>${APP_NAME} adalah platform top up game digital yang beroperasi melalui bot Telegram dan Discord. Kami bertindak sebagai reseller produk digital dari penyedia resmi.</p>

  <h2>2. Penggunaan Layanan</h2>
  <ul>
    <li>Kamu wajib memastikan ID game dan data yang dimasukkan sudah benar sebelum konfirmasi.</li>
    <li>Setiap transaksi yang sudah dibayar dan diproses tidak dapat dibatalkan.</li>
    <li>Kamu bertanggung jawab penuh atas akun game yang di-top up.</li>
    <li>Dilarang menggunakan layanan untuk tujuan penipuan, pencucian uang, atau aktivitas ilegal.</li>
  </ul>

  <h2>3. Pembayaran</h2>
  <ul>
    <li>Pembayaran diproses melalui Midtrans sebagai payment gateway resmi.</li>
    <li>Tagihan memiliki batas waktu 15 menit. Transaksi yang melewati batas waktu akan otomatis dibatalkan.</li>
    <li>Harga yang tertera sudah termasuk biaya layanan dan bersifat final.</li>
    <li>Kami tidak menyimpan data kartu kredit atau informasi pembayaran sensitif.</li>
  </ul>

  <h2>4. Refund &amp; Pembatalan</h2>
  <p>Transaksi yang telah berhasil diproses pada umumnya tidak dapat direfund karena bersifat digital dan instan. Pengecualian berlaku jika:</p>
  <ul>
    <li>Item tidak masuk ke akun dalam 24 jam setelah pembayaran dikonfirmasi.</li>
    <li>Terjadi kesalahan teknis pada sistem kami.</li>
  </ul>
  <p>Untuk klaim refund, hubungi kami melalui fitur feedback di bot dengan menyertakan nomor order (#YM-XXXXX).</p>

  <h2>5. Sistem Poin</h2>
  <ul>
    <li>Poin diperoleh dari setiap transaksi yang berhasil (SUCCESS).</li>
    <li>Poin berlaku selama 90 hari sejak transaksi terakhir.</li>
    <li>Poin tidak dapat ditransfer, dicairkan, atau ditukar menjadi uang tunai.</li>
    <li>Kami berhak mengubah nilai tukar poin dengan pemberitahuan terlebih dahulu.</li>
  </ul>

  <h2>6. Batasan Tanggung Jawab</h2>
  <p>${APP_NAME} tidak bertanggung jawab atas:</p>
  <ul>
    <li>Kesalahan input data (User ID, Server ID) yang dilakukan oleh pengguna.</li>
    <li>Gangguan layanan akibat pemeliharaan platform pihak ketiga (Telegram, Discord, game publisher).</li>
    <li>Kerugian tidak langsung yang timbul dari penggunaan layanan.</li>
  </ul>

  <h2>7. Perubahan Layanan</h2>
  <p>Kami berhak mengubah, menangguhkan, atau menghentikan layanan kapan saja dengan pemberitahuan minimal 7 hari melalui bot atau media sosial resmi.</p>

  <h2>8. Hukum yang Berlaku</h2>
  <p>Syarat dan ketentuan ini diatur oleh hukum Republik Indonesia. Segala sengketa diselesaikan secara musyawarah, atau melalui pengadilan yang berwenang di Indonesia.</p>

  <h2>9. Kontak</h2>
  <p>Pertanyaan atau keluhan dapat disampaikan melalui fitur feedback di bot ${APP_NAME} atau menghubungi admin melalui platform yang tersedia.</p>
</div>
${FOOTER}
`;

  return c.html(landingLayout(
    `Syarat & Ketentuan — ${APP_NAME}`,
    `Baca syarat dan ketentuan penggunaan layanan top up game ${APP_NAME}.`,
    body,
  ));
});

// ─── GET /privacy — Kebijakan Privasi ────────────────────────────────────────

landing.get("/privacy", (c) => {
  const body = `
${NAV}
<div class="prose">
  <h1>Kebijakan Privasi</h1>
  <p class="updated">Terakhir diperbarui: 1 Januari 2025</p>

  <p>Kebijakan ini menjelaskan bagaimana ${APP_NAME} mengumpulkan, menggunakan, dan melindungi data pribadi kamu saat menggunakan layanan kami.</p>

  <h2>1. Data yang Kami Kumpulkan</h2>
  <p>Kami mengumpulkan data minimal yang diperlukan untuk menjalankan layanan:</p>
  <ul>
    <li><strong>Identitas platform:</strong> User ID dan username dari Telegram atau Discord.</li>
    <!-- WhatsApp (nomor HP) — akan ditambahkan saat layanan aktif -->
    <li><strong>Data transaksi:</strong> Game yang dibeli, nominal, ID game yang di-top up, status pembayaran.</li>
    <li><strong>Data poin:</strong> Akumulasi dan riwayat penukaran poin.</li>
    <li><strong>Log teknis:</strong> Timestamp transaksi untuk keperluan audit dan penyelesaian sengketa.</li>
  </ul>

  <h2>2. Data yang TIDAK Kami Kumpulkan</h2>
  <ul>
    <li>Data kartu kredit atau rekening bank.</li>
    <li>Password atau PIN akun game kamu.</li>
    <li>Isi percakapan di luar alur transaksi bot.</li>
    <li>Data lokasi atau perangkat.</li>
  </ul>

  <h2>3. Penggunaan Data</h2>
  <p>Data kamu digunakan untuk:</p>
  <ul>
    <li>Memproses transaksi top up.</li>
    <li>Menampilkan riwayat transaksi.</li>
    <li>Mengelola saldo poin reward.</li>
    <li>Mengirim notifikasi status transaksi.</li>
    <li>Menangani keluhan dan permintaan refund.</li>
    <li>Mencegah penipuan dan penyalahgunaan layanan.</li>
  </ul>

  <h2>4. Berbagi Data dengan Pihak Ketiga</h2>
  <p>Kami membagikan data terbatas kepada:</p>
  <ul>
    <li><strong>Digiflazz</strong> (supplier): User ID game untuk memproses top up.</li>
    <li><strong>Midtrans</strong> (payment): Data transaksi untuk memproses pembayaran.</li>
  </ul>
  <p>Kami tidak menjual data pribadi kamu kepada pihak manapun untuk tujuan pemasaran.</p>

  <h2>5. Keamanan Data</h2>
  <ul>
    <li>Data disimpan di server yang dilindungi firewall dan enkripsi.</li>
    <li>Akses ke database dibatasi hanya untuk sistem otomatis dan admin terotorisasi.</li>
    <li>Komunikasi menggunakan HTTPS/TLS.</li>
    <li>Token dan kredensial sensitif tidak pernah disimpan dalam log.</li>
  </ul>

  <h2>6. Retensi Data</h2>
  <p>Data transaksi disimpan selama minimal 1 tahun untuk keperluan audit dan penyelesaian sengketa. Data akun pengguna disimpan selama akun aktif dan dapat dihapus atas permintaan.</p>

  <h2>7. Hak Pengguna</h2>
  <p>Kamu berhak untuk:</p>
  <ul>
    <li>Meminta salinan data pribadi yang kami miliki.</li>
    <li>Meminta penghapusan akun dan data terkait (kecuali data transaksi yang masih dalam masa retensi).</li>
    <li>Mengajukan keberatan atas penggunaan data.</li>
  </ul>
  <p>Untuk mengajukan permintaan, gunakan fitur feedback di bot ${APP_NAME}.</p>

  <h2>8. Cookie &amp; Sesi Admin</h2>
  <p>Panel admin menggunakan cookie sesi yang bersifat httpOnly dan secure. Cookie ini tidak digunakan untuk melacak pengguna umum.</p>

  <h2>9. Perubahan Kebijakan</h2>
  <p>Perubahan kebijakan privasi akan diberitahukan melalui bot atau halaman ini minimal 7 hari sebelum berlaku.</p>

  <h2>10. Kontak</h2>
  <p>Pertanyaan seputar privasi dapat disampaikan melalui fitur feedback di bot ${APP_NAME}.</p>
</div>
${FOOTER}
`;

  return c.html(landingLayout(
    `Kebijakan Privasi — ${APP_NAME}`,
    `Pelajari bagaimana ${APP_NAME} mengumpulkan, menggunakan, dan melindungi data pribadimu.`,
    body,
  ));
});

export default landing;
