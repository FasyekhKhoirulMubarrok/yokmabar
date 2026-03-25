# CLAUDE.md — YokMabar Bot Top Up (Telegram + WhatsApp + Discord)

> File ini dibaca otomatis oleh Claude Code di setiap sesi.
> Selalu gunakan `use context7` saat butuh dokumentasi library terbaru.

---

## 🧠 Aturan Utama Claude Code

- **Selalu gunakan Context7** untuk referensi dokumentasi library yang up-to-date
- Jangan pernah menebak API — selalu fetch docs via Context7 sebelum generate kode
- Semua kode wajib **TypeScript** — tidak ada plain JavaScript
- Bangun per fase, test tiap fase sebelum lanjut ke fase berikutnya

---

## 🚀 Langkah-Langkah Prompt (36 Prompt — Dari Nol Sampai Production)

> **Cara pakai:** Buka Claude Code di folder project, ketik prompt tanpa tanda petik.
> Selesaikan satu prompt → test → baru lanjut ke prompt berikutnya.
> Mulai sesi baru (`/rename`) untuk setiap fase baru.

---

### FASE 1 — Fondasi
*Sesi baru: `/rename yokmabar-fondasi`*

```
1. Buat struktur project lengkap dengan package.json, tsconfig.json,
   .env.example, .gitignore, dan docker-compose.yml. use context7
```
✅ Test: `docker-compose up -d` → tidak ada error

```
2. Buat Prisma schema lengkap sesuai semua model di CLAUDE.md
   dan generate migration awal. use context7
```
✅ Test: `npx prisma studio` → tabel tampil di browser

```
3. Buat src/config.ts untuk validasi semua env variables
   menggunakan Zod. use context7
```

```
4. Buat src/db/client.ts sebagai Prisma client singleton. use context7
```

---

### FASE 2 — Services (Business Logic)
*Sesi baru: `/rename yokmabar-services`*

```
5. Buat src/services/product.service.ts untuk ambil produk
   dari DB dengan Redis cache TTL 30 menit. use context7
```

```
6. Buat src/services/order.service.ts dengan state machine
   lengkap sesuai alur di CLAUDE.md. use context7
```

```
7. Buat src/services/payment.service.ts untuk integrasi
   Duitku — create invoice dan validasi webhook signature. use context7
```

```
8. Buat src/services/supplier.service.ts untuk integrasi
   Digiflazz — top up dengan HMAC MD5 signature dan
   handle semua status response. use context7
```

```
9. Buat src/services/point.service.ts dengan fungsi
   earnPoints, getActivePoints, redeemPoints,
   dan expirePoints sesuai aturan di CLAUDE.md. use context7
```

```
10. Buat src/services/balance.service.ts untuk cek
    saldo Digiflazz dengan HMAC MD5 signature. use context7
```

```
11. Buat src/services/notification.service.ts untuk kirim
    notif ke user dan admin di semua platform
    sesuai template pesan YokMabar di CLAUDE.md. use context7
```

```
12. Buat src/services/history.service.ts untuk ambil
    5 transaksi terakhir user. use context7
```
✅ Test: `npx tsc --noEmit` → tidak ada TypeScript error

---

### FASE 3 — Background Jobs
*Sesi baru: `/rename yokmabar-jobs`*

```
13. Buat src/jobs/queue.ts dengan definisi semua
    BullMQ queue. use context7
```

```
14. Buat src/jobs/order.worker.ts untuk proses
    top up ke Digiflazz. use context7
```

```
15. Buat src/jobs/expire.worker.ts untuk expire
    order otomatis setelah 15 menit. use context7
```

```
16. Buat src/jobs/sync.worker.ts untuk sync harga
    Digiflazz 3 layer sesuai CLAUDE.md — full sync
    jam 3 pagi, partial sync setiap 6 jam, on-demand
    dengan cooldown 15 menit. use context7
```

```
17. Buat src/jobs/balance.worker.ts untuk cek saldo
    Digiflazz setiap 1 jam dan notif admin
    jika menipis. use context7
```

---

### FASE 4 — API & Webhook
*Sesi baru: `/rename yokmabar-api`*

```
18. Buat src/api/health.ts untuk endpoint
    GET /health. use context7
```

```
19. Buat src/api/webhook.duitku.ts dengan validasi
    signature dan idempotency check. use context7
```

```
20. Buat src/api/webhook.digiflazz.ts dengan validasi
    signature dan idempotency check. use context7
```

```
21. Buat src/api/index.ts untuk register semua routes
    Hono dengan middleware logger, cors,
    dan rate limiter. use context7
```
✅ Test: `npm run dev` → `GET /health` return 200

---

### FASE 5 — Bot Telegram
*Sesi baru: `/rename yokmabar-telegram`*

```
22. Buat src/bots/telegram/scenes/topup.scene.ts
    dengan Grammy Scenes — flow inline keyboard
    lengkap sesuai UX di CLAUDE.md termasuk
    fitur cari game dan penawaran poin. use context7
```

```
23. Buat src/bots/telegram/commands.ts untuk command
    /start, /topup, /riwayat, dan /poin
    sesuai template pesan YokMabar di CLAUDE.md. use context7
```

```
24. Buat src/bots/telegram/index.ts untuk setup
    Grammy bot dan register semua command
    dan scene. use context7
```
✅ Test: Jalankan bot, ketik /start di Telegram → pesan welcome muncul

---

### FASE 6 — Bot Discord
*Sesi baru: `/rename yokmabar-discord`*

```
25. Buat src/bots/discord/commands/topup.ts dengan
    slash command /topup — autocomplete game dan
    nominal, modal input User ID dan Server ID,
    embed konfirmasi dengan buttons,
    semua ephemeral. use context7
```

```
26. Buat src/bots/discord/deploy-commands.ts untuk
    register slash commands ke Discord API. use context7
```

```
27. Buat src/bots/discord/index.ts untuk setup
    discord.js client dan handle semua
    interaction. use context7
```
✅ Test: `npx tsx src/bots/discord/deploy-commands.ts` → commands terdaftar
✅ Test: Ketik /topup di Discord → autocomplete muncul

---

### FASE 7 — Bot WhatsApp
*Sesi baru: `/rename yokmabar-whatsapp`*

```
28. Buat src/bots/whatsapp/handler.ts untuk step-by-step
    flow numbered menu lengkap sesuai UX di CLAUDE.md —
    termasuk state management di Redis TTL 10 menit,
    cari game, dan penawaran poin. use context7
```

```
29. Buat src/bots/whatsapp/index.ts untuk setup
    Fonnte webhook receiver dan routing
    ke handler. use context7
```
✅ Test: Kirim pesan ke WA → numbered menu muncul

---

### FASE 8 — Utils & Entrypoint
*Sesi baru: `/rename yokmabar-entrypoint`*

```
30. Buat src/utils/logger.ts dengan Winston,
    src/utils/signature.ts untuk validasi webhook,
    dan src/utils/formatter.ts untuk format Rupiah
    dan tanggal. use context7
```

```
31. Buat src/index.ts sebagai entrypoint yang
    start semua service — Hono API, ketiga bot,
    dan semua BullMQ workers sekaligus. use context7
```
✅ Test: `npm run dev` → semua service nyala tanpa error

---

### FASE 9 — Deployment
*Sesi baru: `/rename yokmabar-deploy`*

```
32. Buat Dockerfile multi-stage untuk production
    build yang optimal. use context7
```

```
33. Buat konfigurasi Nginx sebagai reverse proxy
    dengan SSL termination untuk VPS. use context7
```

```
34. Buat script setup VPS — install Docker,
    Docker Compose, Nginx, dan Certbot
    untuk HTTPS. use context7
```
✅ Test: `docker-compose up -d` di VPS → semua container running

---

### FASE 10 — Testing
*Sesi baru: `/rename yokmabar-testing`*

```
35. Buat unit test untuk order.service.ts
    dan point.service.ts menggunakan
    Vitest. use context7
```

```
36. Buat integration test untuk webhook
    Duitku dan Digiflazz. use context7
```
✅ Test: `npm run test` → semua test pass

---

### SETELAH SEMUA FASE SELESAI

```
Lakukan full review semua file yang sudah dibuat,
pastikan konsisten dengan CLAUDE.md — naming, error handling,
tone of voice pesan bot, dan konvensi coding. use context7
```

---

## 📦 Tech Stack

### Backend API
- **Runtime:** Node.js 20+ (LTS)
- **Language:** TypeScript 5+
- **Framework:** Hono
- **HTTP Client:** fetch native Node.js 20 (bukan axios)
- **Validasi:** Zod

### Database
- **Database:** PostgreSQL 16+
- **ORM:** Prisma 5+
- **Cache / Queue:** Redis + BullMQ
- **Hosting DB:** Supabase (managed) atau PostgreSQL di VPS sendiri

### Bot Libraries
- **Telegram:** Grammy v1+
- **Discord:** discord.js v14+
- **WhatsApp:** Fonnte API (REST HTTP — tidak perlu library khusus)

### Payment Gateway
- **Primary:** Duitku (QRIS, GoPay, OVO, Dana)

### Supplier Top Up
- **Primary:** Digiflazz API

### Infrastructure
- **Container:** Docker + Docker Compose
- **Hosting:** VPS (Niagahoster atau DigitalOcean)
- **Reverse Proxy:** Nginx + Certbot (HTTPS wajib untuk webhook)
- **Background Jobs:** BullMQ + Redis
- **Process Manager:** Docker restart policy
- **Monitoring:** Winston logger + notif Telegram ke admin

---

## 📁 Struktur Folder

```
topup-bot/
├── CLAUDE.md                      ← file ini
├── .env                           ← secrets (jangan di-commit!)
├── .env.example                   ← template env
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
└── src/
    ├── index.ts                   ← entrypoint
    ├── config.ts                  ← env vars via Zod
    │
    ├── api/
    │   ├── index.ts
    │   ├── webhook.duitku.ts
    │   ├── webhook.digiflazz.ts
    │   └── health.ts
    │
    ├── bots/
    │   ├── telegram/
    │   │   ├── index.ts
    │   │   ├── commands.ts
    │   │   └── scenes/
    │   │       └── topup.scene.ts
    │   ├── discord/
    │   │   ├── index.ts
    │   │   ├── commands/
    │   │   │   └── topup.ts
    │   │   └── deploy-commands.ts
    │   └── whatsapp/
    │       ├── index.ts
    │       └── handler.ts
    │
    ├── services/
    │   ├── order.service.ts
    │   ├── payment.service.ts
    │   ├── supplier.service.ts
    │   ├── balance.service.ts
    │   ├── product.service.ts
    │   ├── point.service.ts
    │   ├── notification.service.ts
    │   └── history.service.ts
    │
    ├── jobs/
    │   ├── queue.ts
    │   ├── order.worker.ts
    │   ├── expire.worker.ts
    │   ├── balance.worker.ts
    │   └── sync.worker.ts
    │
    ├── db/
    │   └── client.ts
    │
    └── utils/
        ├── logger.ts
        ├── signature.ts
        └── formatter.ts
```

---

## 🗄️ Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id             String   @id @default(uuid())
  platform       Platform
  platformUserId String
  username       String?
  createdAt      DateTime @default(now())
  orders         Order[]
  points         Point[]

  @@unique([platform, platformUserId])
}

model Product {
  id           String   @id @default(uuid())
  brand        String
  category     String
  itemCode     String   @unique
  itemName     String
  price        Int
  isActive     Boolean  @default(true)
  isPopular    Boolean  @default(false)
  displayOrder Int      @default(999)
  lastSyncedAt DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([brand])
  @@index([isActive, isPopular])
  @@index([category])
}

model Order {
  id            String      @id @default(uuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id])
  game          String
  gameUserId    String
  gameServerId  String?
  itemCode      String
  itemName      String
  amount        Int
  status        OrderStatus @default(PENDING)
  paymentMethod String?
  paymentUrl    String?
  paymentRef    String?     @unique
  supplierRef   String?     @unique
  adminNote     String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  expiredAt     DateTime
  point         Point?

  @@index([userId])
  @@index([status])
  @@index([paymentRef])
}

model Point {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  orderId     String?   @unique
  order       Order?    @relation(fields: [orderId], references: [id])
  type        PointType
  amount      Int
  description String
  expiredAt   DateTime
  createdAt   DateTime  @default(now())

  @@index([userId])
  @@index([expiredAt])
}

enum Platform {
  TELEGRAM
  DISCORD
  WHATSAPP
}

enum OrderStatus {
  PENDING
  PAID
  PROCESSING
  SUCCESS
  FAILED
  EXPIRED
}

enum PointType {
  EARNED
  REDEEMED
  EXPIRED
}
```

---

## ⚙️ Environment Variables

```env
# App
NODE_ENV=development
PORT=3000
APP_NAME=YokMabar
APP_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/topup_db
REDIS_URL=redis://localhost:6379

# Bot Tokens
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_ID=
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_ADMIN_CHANNEL_ID=
FONNTE_API_KEY=
WHATSAPP_ADMIN_NUMBER=

# Payment — Duitku
DUITKU_MERCHANT_CODE=
DUITKU_API_KEY=
DUITKU_CALLBACK_URL=https://yourdomain.com/webhook/duitku

# Supplier — Digiflazz
DIGIFLAZZ_USERNAME=
DIGIFLAZZ_API_KEY=
DIGIFLAZZ_WEBHOOK_SECRET=
DIGIFLAZZ_MIN_BALANCE=50000

# Sistem Poin
POINT_EXPIRY_DAYS=90
POINT_RATE=1000
POINT_REDEEM_UNIT=200
POINT_REDEEM_VALUE=1000
```

---

## 🔄 Alur Order (State Machine)

```
PENDING → PAID → PROCESSING → SUCCESS
                            ↘ FAILED   ← notif admin otomatis
PENDING → EXPIRED           (otomatis 15 menit via BullMQ)
```

- `PENDING → PAID` — webhook Duitku status `00`
- `PAID → PROCESSING` — request dikirim ke Digiflazz
- `PROCESSING → SUCCESS` — webhook Digiflazz status `Sukses`
- `PROCESSING → FAILED` — webhook Digiflazz `Gagal` atau timeout 10 menit
- `FAILED` — wajib kirim notif admin via Telegram + Discord
- `PENDING → EXPIRED` — BullMQ delayed job 15 menit

---

## 🔁 Strategi Sync Harga Digiflazz (3 Layer)

Jangan hit Digiflazz API langsung saat user request harga.
Selalu: Redis cache → PostgreSQL → Digiflazz (via job terjadwal).

```
Digiflazz API → BullMQ Job → PostgreSQL → Redis Cache (TTL 30 menit) → Bot
```

- **Layer 1 — Full Sync:** Setiap hari jam 03.00 WIB — semua produk
- **Layer 2 — Partial Sync:** Setiap 6 jam — game populer saja (ML, FF, PUBG, Genshin, Valorant)
- **Layer 3 — On-Demand:** Manual admin via `/admin sync` atau `POST /admin/sync-prices` — cooldown 15 menit

---

## 🎨 UX Per Platform

### Prinsip Global
- Tampilkan 5 game terpopuler + opsi **"🔍 Cari game lain..."** sebagai pilihan bernomor explicit
- User awam harus bisa selesai tanpa baca instruksi

### 📱 Telegram — Inline Keyboard
Grammy `Scenes` + `InlineKeyboard`. Semua pilihan via tombol tap.
```
/topup → [ML][FF][PUBG][Genshin][Valorant][🔍 Cari]
→ tap game → [nominal buttons]
→ tap nominal → input User ID
→ konfirmasi [✅ Konfirmasi][❌ Batal]
→ [💰 Pakai poin?] jika saldo ≥ 200
→ [💳 QRIS][💚 GoPay][💜 OVO][💙 Dana]
→ link pembayaran
```

### 💬 WhatsApp — Numbered Menu
Menu bernomor explicit, instruksi diulang di akhir setiap pesan.
State di Redis key `wa:state:{phone}` TTL 10 menit.
Jika state expired → mulai ulang dengan ramah.
```
User kirim pesan apapun → numbered menu muncul
→ balas angka → pilihan selanjutnya
→ input User ID → konfirmasi
→ tawaran poin jika ≥ 200
→ pilih metode bayar → link pembayaran
```

### 🎮 Discord — Slash Command + Autocomplete
discord.js slash command `/topup` dengan autocomplete game + nominal.
Modal untuk input User ID dan Server ID.
Semua reply `ephemeral: true`.
```
/topup game:[autocomplete] nominal:[autocomplete]
→ modal User ID + Server ID
→ embed konfirmasi + buttons metode bayar
→ link pembayaran (ephemeral)
```

---

## 🎁 Sistem Poin

- **Akumulasi:** `Math.floor(amount / 1000)` poin per transaksi SUCCESS
- **Penukaran:** 200 poin = diskon Rp 1.000 (kelipatan 200)
- **Biaya:** ~0.5% dari transaksi — aman dari margin ~8%
- **Expired:** 90 hari sejak transaksi terakhir (di-refresh tiap transaksi baru)
- **Ditawarkan:** otomatis saat checkout jika saldo ≥ 200 poin
- **Tidak ditawarkan:** jika saldo < 200 — jangan ganggu flow

```typescript
earnPoints(userId, orderId, amount):
  poin = Math.floor(amount / 1000)
  buat Point { type: EARNED, amount: poin, expiredAt: now() + 90 hari }
  refresh expiredAt semua poin aktif user → now() + 90 hari

getActivePoints(userId):
  SUM(amount) WHERE userId AND expiredAt > now()

redeemPoints(userId, pointsToRedeem):
  validasi: pointsToRedeem % 200 === 0
  validasi: saldo aktif >= pointsToRedeem
  diskon = (pointsToRedeem / 200) * 1000
  buat Point { type: REDEEMED, amount: -pointsToRedeem }
  return diskon

expirePoints(): // BullMQ job jam 02.00 WIB
  update EXPIRED WHERE expiredAt < now() AND type = EARNED
```

---

## 🎨 Brand & Tone of Voice — YokMabar

- **Nama bot:** YokMabar Bot (semua platform)
- **Tagline:** *Top up cepat, langsung gas — tanpa buka web!*
- **Tone:** Campuran — santai & akrab, tapi tetap sopan
- Gunakan "kamu", bukan "lo" atau "anda"
- Boleh: "gas", "yok", "mantap", "siap"
- Emoji max 2–3 per pesan
- Format rupiah: `Rp 19.000` (spasi + titik ribuan)
- Kode order: `#YM-XXXXX`

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

Tagihan:
💳 Tagihan YokMabar
Nominal  : Rp 37.500
Order    : #YM-12345
Berlaku  : 15 menit ⏰
Selesaikan pembayaran sebelum waktu habis ya!

Sukses:
🎉 Top up berhasil!
{item} sudah masuk ke akun kamu.
Cek in-game sekarang dan langsung gas! 🚀
+{n} poin diterima · Total: {total} poin

Error:
😅 Ups, ada gangguan sebentar.
Coba lagi dalam beberapa menit ya!

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

---

## 🧑‍💻 Konvensi Coding

- **TypeScript strict** — tidak ada `any`
- Semua I/O wajib `async/await`
- `fetch` native Node.js 20 — tidak pakai axios
- Format: **Prettier** + **ESLint** TypeScript strict
- File: `kebab-case.ts` | Class: `PascalCase` | Fungsi: `camelCase`
- Konstanta: `UPPER_SNAKE_CASE` | Enum: `UPPER_SNAKE_CASE`
- Custom error: `PaymentError`, `SupplierError`, `OrderError`
- Validasi signature webhook sebelum proses apapun
- Idempotency check `paymentRef` sebelum proses webhook
- Jangan log API key, token, atau data sensitif

---

## 🔔 Notif Admin — Order Gagal

```
🚨 ORDER GAGAL
Order ID : #YM-xxxxx
Game     : Mobile Legends
Item     : 86 Diamonds
User     : @username (Telegram)
Game ID  : 123456789
Error    : [pesan dari Digiflazz]
Waktu    : 23 Mar 2026 14:32 WIB
```
Kirim ke: `TELEGRAM_ADMIN_CHAT_ID` + embed merah `DISCORD_ADMIN_CHANNEL_ID` + Winston error log

---

## 🚀 Quick Start (Development)

```bash
npm install
cp .env.example .env
docker-compose up -d postgres redis
npx prisma migrate dev --name init
npx prisma generate
npx tsx src/bots/discord/deploy-commands.ts
npm run dev
```

---

## ✅ Checklist Sebelum Production

### Server
- [ ] VPS: Docker + Docker Compose terinstall
- [ ] Domain pointing ke IP VPS
- [ ] Nginx + Certbot aktif — HTTPS berjalan
- [ ] Firewall: hanya port 80, 443, 22 terbuka

### Config
- [ ] Semua env variable diisi
- [ ] APP_URL pakai HTTPS
- [ ] Webhook URL Duitku terdaftar
- [ ] Webhook URL Digiflazz terdaftar
- [ ] Discord slash commands di-deploy

### Keamanan
- [ ] Validasi signature Duitku aktif
- [ ] Validasi signature Digiflazz aktif
- [ ] Idempotency check aktif
- [ ] Rate limiting aktif
- [ ] State WA Redis TTL aktif
- [ ] .env tidak ter-commit ke Git

### Testing Bot
- [ ] Telegram: /start → flow lengkap → sukses
- [ ] WhatsApp: menu → flow lengkap → sukses
- [ ] Discord: /topup → autocomplete → modal → sukses
- [ ] Cari game "🔍 Cari game lain" di Telegram & WA
- [ ] Transaksi sandbox Duitku end-to-end
- [ ] Top up sandbox Digiflazz
- [ ] Notif admin saat FAILED
- [ ] Notif saldo Digiflazz menipis
- [ ] /riwayat di ketiga bot
- [ ] Order expired otomatis 15 menit
- [ ] Sync harga on-demand + cooldown

### Testing Poin
- [ ] Poin bertambah setelah SUCCESS
- [ ] Poin tidak bertambah jika FAILED/EXPIRED
- [ ] Tawaran poin muncul saat saldo ≥ 200
- [ ] Tawaran poin tidak muncul saat saldo < 200
- [ ] Tukar poin kelipatan 200 — harga terpotong benar
- [ ] Saldo poin tidak bisa minus
- [ ] expiredAt di-refresh saat transaksi baru
- [ ] BullMQ expire poin harian berjalan

### Go Live
- [ ] Switch Duitku ke production
- [ ] Switch Digiflazz ke production
- [ ] Monitor log 30 menit pertama setelah launch
