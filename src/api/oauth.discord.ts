import { Hono } from "hono";
import { db } from "../db/client.js";
import { recordServerReferral } from "../services/referral.service.js";

const app = new Hono();

// ─── GET /oauth/discord/callback ──────────────────────────────────────────────
//
// Discord redirect setelah user authorize bot lewat link referral.
// Query params yang relevan:
//   guild_id — ID server yang mengundang bot
//   state    — internal User.id dari inviter (di-set saat build invite URL)
//   code     — authorization code (tidak perlu di-exchange, abaikan)

app.get("/callback", async (c) => {
  const guildId = c.req.query("guild_id");
  const state   = c.req.query("state");   // internal User.id

  // Jika salah satu tidak ada, bukan dari link referral kita — redirect saja
  if (guildId == null || state == null || state.trim() === "") {
    return c.redirect("https://discord.com");
  }

  try {
    // Validasi state adalah UUID yang valid dan user-nya ada di DB
    const user = await db.user.findUnique({ where: { id: state } });

    if (user !== null) {
      await recordServerReferral(guildId, null, user.platformUserId, user.username ?? user.platformUserId);
      console.info(`[oauth] Referral via link — guild: ${guildId}, inviter: ${user.username ?? user.id}`);
    }
  } catch (err) {
    // Jangan crash — referral tidak tercatat tapi bot tetap bisa masuk
    console.warn("[oauth] Gagal catat referral dari callback:", err);
  }

  // Tampilkan halaman sukses sederhana
  return c.html(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YokMabar Bot Berhasil Diundang!</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; text-align: center; }
    .card { background: #1e293b; border-radius: 16px; padding: 48px 40px; max-width: 420px; }
    h1 { font-size: 2rem; margin: 0 0 12px; }
    p { color: #94a3b8; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🎮 Berhasil!</h1>
    <p>YokMabar Bot sudah diundang ke server kamu.<br>
    Kamu bisa mulai top up dengan <strong>/topup</strong> di Discord.<br><br>
    Top up cepat, langsung gas! 🚀</p>
  </div>
</body>
</html>
  `);
});

export default app;
