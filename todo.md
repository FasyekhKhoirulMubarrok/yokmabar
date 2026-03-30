# YokMabar — Todo & Perencanaan

## 🔮 Fitur Event Pricing — Promosi Aktif (Fase 2)

> Saat ini event pricing sudah ada (pasif — muncul saat user topup).
> Fase 2 ini adalah fitur promosi aktif yang dikirim ke user secara otomatis.

### Yang perlu dibangun:

- [ ] **Auto-announce ke Discord** saat admin start event
  - Bot post embed ke channel publik (bukan admin channel)
  - Format: nama event, game yang diskon, persentase diskon, waktu berlaku
  - Tombol langsung ke `/topup`

- [ ] **Auto-announce ke Telegram** saat admin start event
  - Broadcast ke semua user yang pernah transaksi (platform TELEGRAM)
  - Format: pesan promosi + tombol [🎮 Top Up Sekarang]
  - Batasi: max 1 broadcast per event (jangan spam)

- [ ] **WhatsApp broadcast** (opsional, perlu API Fonnte blast)
  - Kirim ke nomor yang pernah transaksi
  - Pertimbangkan rate limit Fonnte

- [ ] **Jadwal otomatis** — event berakhir otomatis tanpa admin stop manual
  - BullMQ delayed job saat event dibuat
  - Saat berakhir: kirim pesan "Event telah berakhir, harga kembali normal"

### Catatan desain:
- Simpan `announcedAt` di model `PriceEvent` agar tidak kirim duplikat
- Tambah `discordAnnounceChannelId` di config (beda dari admin channel)
- Pertimbangkan rate limiting Telegram broadcast (30 msg/detik maks)

---

## 🌐 Web Top Up — Fitur Masa Depan

> Landing page sudah ada di `/` untuk branding & SEO.
> Fase berikutnya: tambah fitur top up langsung dari website.

### Yang perlu dibangun:

- [ ] **Halaman Top Up** (`/topup`) — form pilih game, nominal, input User ID
  - Autocomplete game & nominal (reuse endpoint yang sudah ada)
  - Validasi ID via Digiflazz inquiry sebelum lanjut ke pembayaran
  - Redirect ke payment URL Midtrans setelah order dibuat

- [ ] **Autentikasi user** — Login/register via platform (OAuth Discord, atau nomor HP OTP)
  - Atau tanpa login — transaksi guest dengan identifikasi via email/nomor HP

- [ ] **Halaman Status Order** (`/order/:id`) — cek status transaksi
  - Polling atau SSE untuk update real-time

- [ ] **Halaman Riwayat** (jika ada autentikasi) — daftar transaksi user

- [ ] **SEO enhancements**:
  - Sitemap XML (`/sitemap.xml`)
  - robots.txt (`/robots.txt`)
  - Structured data (JSON-LD) untuk rich snippet

### Catatan desain:
- Reuse semua service yang ada (`order.service`, `payment.service`, dll)
- Endpoint API bisa di `/api/topup/*` — terpisah dari admin
- Pertimbangkan CSRF protection untuk form submission
