import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { redis } from "../db/redis.js";
import { config } from "../config.js";
import health from "./health.js";
import webhookMidtrans from "./webhook.midtrans.js";
import webhookDigiflazz from "./webhook.digiflazz.js";
import oauthDiscord from "./oauth.discord.js";
import adminPanel from "./admin/index.js";

const app = new Hono();

// ─── Middleware: Logger ───────────────────────────────────────────────────────

app.use(logger());

// ─── Middleware: CORS ─────────────────────────────────────────────────────────

app.use(
  "/*",
  cors({
    origin: config.APP_URL,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);

// ─── Middleware: Rate Limiter (Redis sliding window) ──────────────────────────
//
// Limit: 60 request per menit per IP.
// Webhook path dikecualikan — Duitku & Digiflazz punya IP server sendiri
// dan tidak boleh di-block.

const RATE_LIMIT = 60;
const RATE_WINDOW = 60; // detik

app.use("/health", async (c, next) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown";

  const key = `ratelimit:${ip}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, RATE_WINDOW);
  }

  if (current > RATE_LIMIT) {
    return c.json(
      { message: "Terlalu banyak request. Coba lagi dalam 1 menit." },
      429,
    );
  }

  await next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.route("/health", health);
app.route("/webhook/midtrans", webhookMidtrans);
app.route("/webhook/digiflazz", webhookDigiflazz);
app.route("/oauth/discord", oauthDiscord);
app.route("/", adminPanel);

// ─── 404 fallback ─────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ message: "Not found" }, 404));

// ─── Error handler ────────────────────────────────────────────────────────────

app.onError((err, c) => {
  console.error("[api] Unhandled error:", err);
  return c.json({ message: "Internal server error" }, 500);
});

export default app;
