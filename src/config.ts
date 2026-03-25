import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  // ── App ──────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  APP_NAME: z.string().default("YokMabar"),
  APP_URL: z.string().url(),

  // ── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // ── Bot Tokens ────────────────────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_ADMIN_CHAT_ID: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_ADMIN_CHANNEL_ID: z.string().min(1),
  FONNTE_API_KEY: z.string().min(1),
  WHATSAPP_ADMIN_NUMBER: z.string().min(1),

  // ── Payment — Duitku ──────────────────────────────────────────────────────
  DUITKU_MERCHANT_CODE: z.string().min(1),
  DUITKU_API_KEY: z.string().min(1),
  DUITKU_CALLBACK_URL: z.string().url(),

  // ── Supplier — Digiflazz ─────────────────────────────────────────────────
  DIGIFLAZZ_USERNAME: z.string().min(1),
  DIGIFLAZZ_API_KEY: z.string().min(1),
  DIGIFLAZZ_WEBHOOK_SECRET: z.string().min(1),
  DIGIFLAZZ_MIN_BALANCE: z.coerce.number().default(50000),

  // ── Sistem Poin ───────────────────────────────────────────────────────────
  POINT_EXPIRY_DAYS: z.coerce.number().default(90),
  POINT_RATE: z.coerce.number().default(1000),
  POINT_REDEEM_UNIT: z.coerce.number().default(200),
  POINT_REDEEM_VALUE: z.coerce.number().default(1000),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
