# CLAUDE.md — YokMabar Bot Top Up (Telegram + WhatsApp + Discord)

> File ini dibaca otomatis oleh Claude Code di setiap sesi.
> Selalu gunakan `use context7` saat butuh dokumentasi library terbaru.
>
> **Status:** Project sudah jadi & jalan (bukan lagi tahap "build dari nol").
> Dokumen ini mencerminkan **kondisi kode yang sebenarnya** — pakai sebagai
> peta arsitektur saat menambah fitur atau memperbaiki bug.

---

## 🧠 Aturan Utama Claude Code

- **Selalu gunakan Context7** untuk referensi dokumentasi library yang up-to-date
- Jangan pernah menebak API — selalu fetch docs via Context7 sebelum generate kode
- Semua kode wajib **TypeScript strict** — tidak ada plain JavaScript, tidak ada `any`
- Test perubahan dengan `npx tsc --noEmit` sebelum dianggap selesai
- Ikuti pola kode yang sudah ada — naming, error handling, tone pesan bot

---

## 📦 Tech Stack (Aktual)

### Backend / Runtime
- **Runtime:** Node.js 20+ (LTS), ESM (`"type": ...` via `.js` import specifier)
- **Language:** TypeScript 5.8 strict (`exactOptionalPropertyTypes` aktif)
- **Framework HTTP:** Hono 4 (`@hono/node-server`)
- **HTTP Client:** `fetch` native Node.js 20 — **tidak pakai axios**
- **Validasi:** Zod 3

### Database & Infra
- **Database:** PostgreSQL 16
- **ORM:** Prisma 6 (`@prisma/client`)
- **Cache / Queue:** Redis 7 (`ioredis`) + BullMQ 5
- **Container:** Docker + Docker Compose
- **Reverse Proxy:** Nginx + Certbot (lihat `nginx/`)

### Bot Libraries
- **Telegram:** Grammy v1 + **`@grammyjs/conversations`** (bukan Scenes lama) — long polling
- **Discord:** discord.js v14 — slash command + autocomplete + modal + buttons
- **WhatsApp:** Fonnte API (REST webhook, tanpa library khusus)

### Payment & Supplier
- **Payment Gateway:** **Midtrans** (QRIS via Core API `/v2/charge`) — bukan Duitku
- **Supplier Top Up:** Digiflazz (HMAC MD5 signature)

### Lain-lain
- **Admin auth:** `bcryptjs` (password hash) + JWT manual (HMAC, lihat `admin/auth.ts`)
- **QR code:** `qrcode` (generate gambar QRIS dari string Midtrans)
- **Export:** `xlsx` (export price list — `scripts/export-pricelist.ts`)
- **Logger:** Winston
- **Test:** Vitest

---

## 📁 Struktur Folder (Aktual)

```
yokmabar/
├── CLAUDE.md                       ← file ini
├── todo.md                         ← rencana fitur masa depan (event promo aktif, web topup)
├── .env / .env.example
├── docker-compose.yml              ← postgres + redis + app (profile: production)
├── Dockerfile                      ← multi-stage, EXPOSE 4000, non-root user
├── package.json
├── tsconfig.json
│
├── nginx/
│   ├── yokmabar.conf               ← reverse proxy + SSL
│   └── DEPLOY.md                   ← catatan deployment VPS
│
├── public/images/                  ← logo untuk landing page
├── scripts/
│   └── export-pricelist.ts         ← export harga ke Excel
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/                 ← init → referral → feedback → event → cancelled → review → disruption
│
└── src/
    ├── index.ts                    ← entrypoint: start API + bot Telegram/Discord + 5 worker
    ├── config.ts                   ← env vars via Zod
    │
    ├── api/
    │   ├── index.ts                ← register routes, middleware (logger, cors, rate limit), static
    │   ├── health.ts               ← GET /health
    │   ├── webhook.midtrans.ts     ← webhook pembayaran (SHA512 signature + idempotency)
    │   ├── webhook.digiflazz.ts    ← webhook supplier (MD5 signature + idempotency)
    │   ├── oauth.discord.ts        ← OAuth Discord (link akun)
    │   ├── landing.ts              ← landing page publik (branding/SEO)
    │   └── admin/
    │       ├── index.ts            ← mount semua route + HTML pages admin
    │       ├── auth.ts             ← login/logout, JWT
    │       ├── middleware.ts       ← guard API (JWT) & guard halaman
    │       ├── stats.ts            ← dashboard stats + trigger sync
    │       ├── events.ts           ← CRUD event pricing
    │       ├── feedback.ts         ← kelola tiket feedback
    │       ├── products.ts         ← kelola produk (popular, disrupt, dll)
    │       ├── manual-topup.ts     ← top up manual oleh admin
    │       └── pages.ts            ← semua HTML page (login, dashboard, revenue, events,
    │                                  feedback, servers, reviews, products, manual-topup)
    │
    ├── bots/
    │   ├── telegram/
    │   │   ├── index.ts            ← setup Grammy + conversations + register handler
    │   │   ├── commands.ts         ← /start /topup /riwayat /poin /feedback + review + cancel + admin reply
    │   │   └── scenes/
    │   │       ├── topup.scene.ts  ← conversation flow top up (BotContext didefinisikan di sini)
    │   │       └── feedback.scene.ts
    │   ├── discord/
    │   │   ├── index.ts            ← setup client + handle interaction
    │   │   ├── deploy-commands.ts  ← register slash command ke Discord API
    │   │   └── commands/
    │   │       ├── topup.ts        ← /topup (autocomplete + modal + buttons)
    │   │       ├── referral.ts     ← /referral (server referral)
    │   │       ├── feedback.ts     ← /feedback
    │   │       ├── review.ts       ← review handler
    │   │       └── help.ts         ← /help
    │   └── whatsapp/
    │       ├── index.ts            ← Fonnte webhook receiver (router Hono)
    │       └── handler.ts          ← numbered-menu state machine (state di Redis)
    │
    ├── services/
    │   ├── order.service.ts        ← state machine order (+ CANCELLED)
    │   ├── payment.service.ts      ← Midtrans: createInvoice (QRIS) + validateWebhook (SHA512)
    │   ├── supplier.service.ts     ← Digiflazz: topUp, checkGameId (inquiry), validateWebhook (MD5)
    │   ├── balance.service.ts      ← cek saldo Digiflazz (MD5 sign "depo")
    │   ├── product.service.ts      ← produk dari DB + Redis cache TTL 30 menit + search
    │   ├── point.service.ts        ← earn/getActive/redeem/expire + getPointSummary
    │   ├── event.service.ts        ← event pricing (display vs actual markup, strikethrough)
    │   ├── referral.service.ts     ← server referral Discord + bonus poin
    │   ├── feedback.service.ts     ← tiket feedback + reply
    │   ├── review.service.ts       ← rating bintang + post ke channel Discord
    │   ├── notification.service.ts ← notif user & admin lintas platform
    │   └── history.service.ts      ← 5 transaksi terakhir + formatter
    │
    ├── jobs/
    │   ├── queue.ts                ← definisi queue: order, expire, sync, balance + helper
    │   ├── order.worker.ts         ← proses top up ke Digiflazz (retry 3x backoff)
    │   ├── expire.worker.ts        ← expire order PENDING 15 menit (delayed job)
    │   ├── sync.worker.ts          ← sync harga 3 layer + deteksi gangguan supplier
    │   ├── balance.worker.ts       ← cek saldo Digiflazz tiap 1 jam
    │   └── feedback.worker.ts      ← auto-close tiket feedback
    │
    ├── db/
    │   ├── client.ts               ← Prisma client singleton
    │   └── redis.ts                ← ioredis singleton
    │
    └── utils/
        ├── logger.ts              ← Winston
        ├── signature.ts           ← helper validasi webhook
        └── formatter.ts           ← format Rupiah & tanggal
```

> ⚠️ Import pakai ekstensi `.js` (ESM): `import { db } from "../db/client.js"`.

---

## 🗄️ Prisma Schema (Aktual)

Model: `User`, `Product`, `PriceEvent`, `Order`, `ServerReferral`, `Point`,
`Feedback`, `FeedbackReply`, `Review`.
Enum: `Platform`, `OrderStatus`, `PointType`, `FeedbackStatus`, `EventScope`.

Perubahan penting dari skema awal:
- **`Product`** tambah `basePrice` (harga modal Digiflazz), `isDisrupted` + `disruptedAt`
  (deteksi gangguan supplier). `price` = harga jual (sudah markup).
- **`Order`** tambah `discordGuildId` (untuk atribusi referral server). `OrderStatus`
  tambah **`CANCELLED`** (user batal sebelum bayar).
- **`PriceEvent`** — event/promo harga: `displayMarkupRate` (harga coret) vs
  `actualMarkupRate` (harga bayar), `scope` ALL/BRAND/ITEMS + `scopeValue`/`scopeItemCodes`,
  `startAt`/`endAt`, `isActive`.
- **`ServerReferral`** — atribusi server Discord ke inviter, untuk bonus poin.
- **`Feedback` + `FeedbackReply`** — sistem tiket support dua arah.
- **`Review`** — rating bintang per order, dipost ke channel Discord.

> Sumber kebenaran skema adalah `prisma/schema.prisma`. Selalu buat migration
> (`npx prisma migrate dev --name ...`) saat mengubah skema.

---

## ⚙️ Environment Variables (Aktual — lihat `.env.example`)

```env
# App
NODE_ENV=development
PORT=3000                  # docker-compose expose 4000 (lihat .env PORT di prod)
APP_NAME=YokMabar
APP_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://yokmabar:secret@localhost:5432/topup_db
REDIS_URL=redis://localhost:6379

# Bot Tokens
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_ID=
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_ADMIN_CHANNEL_ID=
DISCORD_REVIEW_CHANNEL_ID=      # channel publik untuk post review bintang
FONNTE_API_KEY=
WHATSAPP_ADMIN_NUMBER=

# Payment — Midtrans (QRIS)
MIDTRANS_SERVER_KEY=
MIDTRANS_WEBHOOK_URL=https://yourdomain.com/webhook/midtrans

# Supplier — Digiflazz
DIGIFLAZZ_USERNAME=
DIGIFLAZZ_API_KEY=
DIGIFLAZZ_WEBHOOK_SECRET=
DIGIFLAZZ_MIN_BALANCE=50000

# Sistem Poin
POINT_EXPIRY_DAYS=90
POINT_RATE=2000                 # 1 poin per Rp 2.000 (Math.floor(amount/POINT_RATE))
POINT_REDEEM_UNIT=200           # tukar kelipatan 200 poin
POINT_REDEEM_VALUE=1000         # 200 poin = diskon Rp 1.000

# Referral Discord
REFERRAL_BONUS_POINTS=10

# Markup Harga
PRICE_MARKUP_RATE=0.05          # margin harga normal 5%
PRICE_EVENT_RATE=0.03           # margin harga saat event 3%

# Admin Web Panel
# Generate hash: node -e "require('bcryptjs').hash('password',10).then(console.log)"
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=
ADMIN_JWT_SECRET=               # min 16 char

# Development Only
DISCORD_TEST_GUILD_ID=          # deploy slash command instan ke 1 guild (testing)

# PostgreSQL (docker-compose)
POSTGRES_USER=yokmabar
POSTGRES_PASSWORD=secret
POSTGRES_DB=topup_db
```

> `config.ts` memvalidasi semua env dengan Zod dan `process.exit(1)` jika tidak valid.

---

## 🔄 Alur Order (State Machine — `order.service.ts`)

```
PENDING → PAID → PROCESSING → SUCCESS
                            ↘ FAILED   ← notif admin otomatis
PENDING → EXPIRED           (otomatis 15 menit via BullMQ delayed job)
PENDING → CANCELLED         (user tekan tombol batal sebelum bayar)
```

`VALID_TRANSITIONS`:
- `PENDING → PAID | EXPIRED | CANCELLED`
- `PAID → PROCESSING`
- `PROCESSING → SUCCESS | FAILED`
- `SUCCESS | FAILED | EXPIRED | CANCELLED` → terminal

Pemicu transisi:
- `PENDING → PAID` — webhook **Midtrans** status `settlement`/`capture` (status_code `200`)
- `PAID → PROCESSING` — order worker kirim request ke Digiflazz (`markAsProcessing` + `supplierRef`)
- `PROCESSING → SUCCESS` — Digiflazz `Sukses` (langsung saat topUp atau via webhook)
- `PROCESSING → FAILED` — Digiflazz `Gagal` / timeout → **wajib notif admin** (Telegram + Discord)
- `PENDING → EXPIRED` — BullMQ `expireQueue` delayed 15 menit (`scheduleOrderExpiry`)
- `PENDING → CANCELLED` — `cancelOrder()` dari tombol batal

> Kode order: `YM-XXXXX` (5 char random A-Z0-9), disimpan di `Order.paymentRef`.

---

## 💳 Payment — Midtrans (`payment.service.ts`)

- Core API `POST /v2/charge` dengan `payment_type: "qris"`.
- Base URL otomatis: sandbox saat `NODE_ENV !== production`, production saat production.
- Auth: `Basic base64(SERVER_KEY:)`.
- `createInvoice` mengembalikan `paymentUrl`, `gatewayTransactionId`, dan **`qrBuffer`**
  (gambar QR di-fetch dari `generate-qr-code` action).
- **Validasi webhook:** `SHA512(order_id + status_code + gross_amount + SERVER_KEY)` == `signature_key`.
  Sukses bila `status_code === "200"` && status `settlement`/`capture` && `fraud_status` accept/kosong.

---

## 🏭 Supplier — Digiflazz (`supplier.service.ts`)

Tiga signature MD5 berbeda:
- **Transaksi:** `MD5(username + apiKey + ref_id)`
- **Webhook:** `MD5(username + WEBHOOK_SECRET + ref_id)` — pakai secret, bukan apiKey
- **Cek saldo:** `MD5(username + apiKey + "depo")`
- **Price list:** `MD5(username + apiKey + "pricelist")` (di `sync.worker.ts`)

- `topUp` kirim `ref_id` (= order id, idempotency key) + `testing` flag saat non-production.
  Status `Sukses`/`Pending`/`Gagal`. `Gagal` → lempar `SupplierError` agar worker mark FAILED.
- `checkGameId` — inquiry "Cek Username" untuk validasi User/Server ID sebelum bayar,
  retry hingga 5x saat `Pending`. `customerNo = gameUserId + gameServerId` (jika ada server).
- Webhook Digiflazz: validasi sign **hanya jika** field `sign` dikirim (opsional di dashboard),
  selebihnya keamanan via lookup `ref_id`.

---

## 🔁 Sync Harga Digiflazz — 3 Layer (`sync.worker.ts`)

Jangan hit Digiflazz API langsung saat user minta harga.
Selalu: **Redis cache → PostgreSQL → Digiflazz (via job terjadwal)**.

- **Layer 1 — Full Sync:** harian jam **03.00 WIB** (cron `0 20 * * *` UTC) — semua produk Games
- **Layer 2 — Partial Sync:** tiap **6 jam** — brand populer (ML, FF, PUBG, Genshin, Valorant)
- **Layer 3 — On-Demand:** admin via panel/command — **cooldown 15 menit** (Redis key)

Saat sync:
- Filter `category === "Games"`, buang produk "Cek Username".
- `price = Math.ceil(basePrice * (1 + PRICE_MARKUP_RATE))`. `basePrice` = harga Digiflazz.
- `isActive` dari `buyer_product_status && seller_product_status && stok`.
- **Deteksi gangguan:** `isDisrupted = !seller_product_status`. Saat status berubah,
  kirim notif admin (`notifyAdminSupplierDisruption` / `...Recovered`).
- Invalidasi Redis cache produk setelah upsert.

---

## ⏰ Background Jobs (BullMQ — `jobs/`)

Queue: `order`, `expire`, `sync`, `balance`. Worker yang di-start di `index.ts`:
`orderWorker`, `expireWorker`, `syncWorker`, `balanceWorker`, `feedbackWorker`.

- **order.worker** — proses PAID → top up Digiflazz, retry 3x exponential backoff
- **expire.worker** — expire order PENDING 15 menit (`scheduleOrderExpiry` saat order dibuat;
  `cancelOrderExpiry` saat dibayar)
- **sync.worker** — full/partial/ondemand sync harga + deteksi gangguan
- **balance.worker** — cek saldo Digiflazz tiap 1 jam, notif admin jika < `DIGIFLAZZ_MIN_BALANCE`
- **feedback.worker** — auto-close tiket feedback yang sudah lama

> `point.service.expirePoints()` ada untuk men-expire poin EARNED kedaluwarsa, namun
> **belum di-wire ke schedule worker** — panggil manual / tambah schedule jika dibutuhkan.

---

## 🌐 API Routes (`api/index.ts`)

Middleware global: Hono `logger`, `cors` (origin `APP_URL`), rate limiter Redis
(60 req/menit/IP, hanya di `/health`), static `/images/*`.

- `GET  /health`
- `POST /webhook/midtrans`        ← pembayaran
- `POST /webhook/digiflazz`       ← supplier
- `*    /oauth/discord`           ← OAuth link akun Discord
- `*    /webhook/whatsapp`        ← Fonnte receiver (di-mount di `index.ts`)
- `GET  /`                        ← landing page
- Admin panel (lihat di bawah)

### Admin Web Panel (`api/admin/`)
- API (JWT required): `POST /api/admin/login`, `/logout`, `GET /api/admin` (stats),
  `POST /api/admin/sync`, `events`, `feedback`, `products`, `manual-topup`.
- Halaman HTML (cookie/JWT guard): `/admin/login`, `/admin`, `/admin/revenue`,
  `/admin/events`, `/admin/feedback`, `/admin/servers`, `/admin/reviews`,
  `/admin/products`, `/admin/manual-topup`.

---

## 🎁 Sistem Poin (`point.service.ts`)

- **Akumulasi:** `Math.floor(amount / POINT_RATE)` poin per order SUCCESS (`POINT_RATE=2000`).
  Transaksi kecil < `POINT_RATE` → 0 poin.
- **Penukaran:** kelipatan `POINT_REDEEM_UNIT` (200). Diskon = `(poin/200) * 1000`.
  Pakai Redis lock + DB transaction (cegah double redeem & saldo minus).
- **Expired:** 90 hari (`POINT_EXPIRY_DAYS`), **di-refresh** ke +90 hari tiap order SUCCESS baru.
- **Earn idempotent:** satu order hanya bisa earn sekali (`Point.orderId @unique`).
- **REDEEMED** disimpan amount negatif; `getActivePoints` hanya SUM EARNED aktif.
- **Ditawarkan** otomatis saat checkout bila `canRedeem` (saldo ≥ 200); jika < 200 jangan ganggu flow.

---

## 🎉 Event Pricing / Promo (`event.service.ts`)

- Dua markup: `actualMarkupRate` (yang user bayar) & `displayMarkupRate` (harga coret palsu).
  `discountPercent` = `round((1 - actual/strikethrough) * 100)`.
- Scope: `ALL` | `BRAND` (`scopeValue`) | `ITEMS` (`scopeItemCodes[]`).
- Event aktif difilter via `getActiveEvent(brand, itemCode)` dengan window `startAt`/`endAt`.
- Bersifat **pasif** (muncul saat user topup). Promo aktif/broadcast = rencana di `todo.md`.

---

## 🤝 Fitur Tambahan

- **Server Referral (Discord)** — `referral.service.ts`, command `/referral`. Server di-link ke
  inviter via `ServerReferral.guildId`; order dari guild itu (`Order.discordGuildId`) memberi
  bonus `REFERRAL_BONUS_POINTS` ke inviter.
- **Feedback / Tiket** — `/feedback` di semua platform → `Feedback` + `FeedbackReply`. Admin balas
  via tombol di Telegram (`fb_reply`/`fb_close`) atau panel. Auto-close via `feedback.worker`.
- **Review / Rating** — setelah SUCCESS user diminta rating bintang (+komentar opsional),
  disimpan `Review` dan dipost ke `DISCORD_REVIEW_CHANNEL_ID`.
- **Deteksi Gangguan Supplier** — produk `isDisrupted` disembunyikan dari menu, admin dinotif.
- **Manual Top Up** — admin bisa top up manual lewat panel (`/admin/manual-topup`).

---

## 🎨 UX Per Platform

### Prinsip Global
- Tampilkan 5 game terpopuler + opsi **"🔍 Cari game lain..."** bernomor explicit
- User awam harus bisa selesai tanpa baca instruksi
- Produk `isDisrupted`/non-aktif tidak ditampilkan

### 📱 Telegram — Grammy Conversations + Inline Keyboard
`@grammyjs/conversations` (`topUpScene`, `feedbackScene`). `BotContext` didefinisikan di
`scenes/topup.scene.ts`. Menu utama: [🎮 Top Up][📋 Riwayat][🎁 Poin Saya].
Command: `/start /topup /riwayat /poin /feedback`.

### 💬 WhatsApp — Numbered Menu (`whatsapp/handler.ts`)
Menu bernomor explicit, state di Redis `wa:state:{phone}` TTL 10 menit.
State expired → mulai ulang dengan ramah.

### 🎮 Discord — Slash Command + Autocomplete (`discord/commands/`)
`/topup` autocomplete game+nominal, modal User/Server ID, embed konfirmasi + buttons,
semua `ephemeral: true`. Command lain: `/referral`, `/feedback`, `/help`, review.

---

## 🎨 Brand & Tone of Voice — YokMabar

- **Nama bot:** YokMabar Bot (semua platform)
- **Tagline:** *Top up cepat, langsung gas — tanpa buka web!*
- **Tone:** santai & akrab tapi sopan. Pakai "kamu" (bukan "lo"/"anda").
- Boleh: "gas", "yok", "mantap", "siap" · Emoji max 2–3 per pesan
- Format rupiah: `Rp 19.000` (spasi + titik ribuan) · Kode order: `#YM-XXXXX`

### Template Pesan Utama

```
/start (baru):
🎮 Halo! Selamat datang di YokMabar Bot!
Top up game kamu lebih cepat, langsung dari chat —
tanpa perlu buka web atau aplikasi tambahan.
Yok, mulai top up sekarang! 👇

/start (returning):
🎮 Halo lagi! Siap mabar hari ini?
Yok lanjut top up — cepet, aman, langsung gas! 👇

Sukses:
🎉 Top up berhasil!
{item} sudah masuk ke akun kamu.
Cek in-game sekarang dan langsung gas! 🚀
+{n} poin diterima · Total: {total} poin

Gagal supplier:
😔 Top up kamu belum berhasil diproses.
Tim kami sudah mendapat notifikasi dan akan segera
menindaklanjuti. Order : #YM-12345

Expired:
⏰ Waktu pembayaran habis
Pesanan #YM-12345 sudah kadaluarsa.
Tenang, kamu bisa order lagi kapan saja! 😊

Fallback:
😊 Halo! Ketik /start atau /topup untuk mulai top up ya.
```

### Notif Admin — Order Gagal
Kirim ke `TELEGRAM_ADMIN_CHAT_ID` + embed merah `DISCORD_ADMIN_CHANNEL_ID` + Winston error log.
```
🚨 ORDER GAGAL
Order ID : #YM-xxxxx
Game     : Mobile Legends
Item     : 86 Diamonds
User     : @username (Telegram)
Game ID  : 123456789
Error    : [pesan dari Digiflazz]
Waktu    : ... WIB
```

---

## 🧑‍💻 Konvensi Coding

- **TypeScript strict** — tidak ada `any`; `exactOptionalPropertyTypes` aktif
  (gunakan `?? null` / kondisional saat assign optional)
- Semua I/O wajib `async/await`; `fetch` native (tanpa axios)
- Import ESM dengan ekstensi `.js`
- File: `kebab-case.ts` | Class: `PascalCase` | Fungsi: `camelCase`
  | Konstanta: `UPPER_SNAKE_CASE` | Enum value: `UPPER_SNAKE_CASE`
- Custom error per domain: `PaymentError`, `SupplierError`, `OrderError`, `PointError` (punya `code`)
- **Validasi signature webhook** sebelum proses apapun (Midtrans SHA512, Digiflazz MD5)
- **Idempotency check** via `paymentRef`/`supplierRef` (`@unique`) sebelum proses webhook
- Jangan log API key, token, atau data sensitif
- Format: Prettier + ESLint TypeScript strict

---

## 🚀 Quick Start (Development)

```bash
npm install
cp .env.example .env            # isi semua secret
docker-compose up -d postgres redis
npx prisma migrate dev          # atau: npx prisma migrate deploy
npx prisma generate
npm run deploy:commands         # register slash command Discord
npm run dev                     # tsx watch src/index.ts
```

Perintah berguna:
- `npm run dev` · `npm run build` · `npm start`
- `npm run lint` · `npm run format` · `npm run test`
- `npm run prisma:studio` — buka Prisma Studio
- `npm run export:pricelist` — export harga ke Excel
- `npx tsc --noEmit` — cek TypeScript tanpa build

---

## 🚀 Deployment (VPS)

- `Dockerfile` multi-stage (base → build-deps → build → deps → production), non-root user,
  `EXPOSE 4000`, healthcheck via `fetch`.
- `docker-compose.yml`: postgres + redis (selalu), `app` di profile `production`.
  Port app bind ke `127.0.0.1:${PORT:-4000}` (di belakang Nginx).
- `nginx/yokmabar.conf` + `nginx/DEPLOY.md` — reverse proxy + SSL (Certbot).
- HTTPS wajib untuk webhook (Midtrans, Digiflazz, Fonnte).

```bash
docker-compose --profile production up -d --build
```

---

## ✅ Checklist Sebelum Production

- [ ] Semua env diisi; `APP_URL` HTTPS
- [ ] Webhook Midtrans & Digiflazz terdaftar ke `APP_URL/webhook/...`
- [ ] Discord slash command di-deploy (`npm run deploy:commands`)
- [ ] Validasi signature Midtrans (SHA512) & Digiflazz (MD5) aktif
- [ ] Idempotency check aktif; rate limiting aktif; state WA TTL aktif
- [ ] `.env` tidak ter-commit; admin panel `ADMIN_PASSWORD_HASH` + `ADMIN_JWT_SECRET` diisi
- [ ] Nginx + Certbot aktif; firewall hanya 80/443/22
- [ ] Switch Midtrans & Digiflazz ke production; monitor log 30 menit pertama

### Testing fungsional
- [ ] Telegram/WhatsApp/Discord: flow top up lengkap → sukses
- [ ] "🔍 Cari game lain" di Telegram & WA
- [ ] Transaksi sandbox Midtrans + top up sandbox Digiflazz end-to-end
- [ ] Notif admin saat FAILED; notif saldo menipis; notif gangguan supplier
- [ ] Order expired otomatis 15 menit; order cancel sebelum bayar
- [ ] Sync harga on-demand + cooldown 15 menit
- [ ] Poin bertambah saat SUCCESS (tidak saat FAILED/EXPIRED); tukar poin kelipatan 200
- [ ] Tawaran poin muncul ≥ 200, tidak muncul < 200; saldo tak bisa minus
- [ ] Event pricing tampil harga coret + diskon; referral bonus; feedback & review jalan
```
