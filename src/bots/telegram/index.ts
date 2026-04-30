import { Bot, session, type StorageAdapter } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { config } from "../../config.js";
import { redis } from "../../db/redis.js";
import { type BotContext, topUpScene } from "./scenes/topup.scene.js";
import { feedbackScene } from "./scenes/feedback.scene.js";
import {
  registerStartCommand,
  registerTopupCommand,
  registerRiwayatCommand,
  registerPoinCommand,
  registerFeedbackCommand,
  registerAdminFeedbackReplyHandler,
  registerCancelOrderHandler,
  registerReviewHandler,
} from "./commands.js";

// ─── Bot Instance ─────────────────────────────────────────────────────────────

export const telegramBot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

// ─── Redis Session Storage ────────────────────────────────────────────────────

const SESSION_TTL_SECONDS = 20 * 60; // 20 menit
const SESSION_KEY_PREFIX = "tg:session:";

function makeRedisStorage<T>(): StorageAdapter<T> {
  return {
    read: async (key: string): Promise<T | undefined> => {
      const val = await redis.get(`${SESSION_KEY_PREFIX}${key}`);
      return val !== null ? (JSON.parse(val) as T) : undefined;
    },
    write: async (key: string, value: T): Promise<void> => {
      await redis.setex(
        `${SESSION_KEY_PREFIX}${key}`,
        SESSION_TTL_SECONDS,
        JSON.stringify(value),
      );
    },
    delete: async (key: string): Promise<void> => {
      await redis.del(`${SESSION_KEY_PREFIX}${key}`);
    },
  };
}

// ─── Middleware ───────────────────────────────────────────────────────────────

// 1. Session — wajib sebelum conversations
telegramBot.use(
  session<Record<string, never>, BotContext>({
    initial: () => ({}),
    storage: makeRedisStorage(),
  }),
);

// 2. Conversations plugin
telegramBot.use(conversations());

// 3. Register scenes
telegramBot.use(createConversation(topUpScene, "topUpScene"));
telegramBot.use(createConversation(feedbackScene, "feedbackScene"));

// ─── Commands ─────────────────────────────────────────────────────────────────

registerStartCommand(telegramBot);
registerTopupCommand(telegramBot);
registerRiwayatCommand(telegramBot);
registerPoinCommand(telegramBot);
registerFeedbackCommand(telegramBot);
registerReviewHandler(telegramBot);
registerAdminFeedbackReplyHandler(telegramBot);
registerCancelOrderHandler(telegramBot);

// ─── Fallback ─────────────────────────────────────────────────────────────────

telegramBot.on("message", async (ctx) => {
  const markerKey = `tg:session:had:${ctx.chat.id}`;
  const hadSession = await redis.exists(markerKey);

  if (hadSession) {
    await redis.del(markerKey);
    await ctx.reply(
      "⏰ Sesi kamu sudah berakhir karena tidak aktif selama 20 menit.\n" +
      "Ketik /topup untuk mulai top up lagi ya! 😊",
    );
    return;
  }

  await ctx.reply("😊 Halo! Ketik /start atau /topup untuk mulai top up ya.");
});

// ─── Error Handler ────────────────────────────────────────────────────────────

telegramBot.catch((err) => {
  console.error("[telegram-bot] Error:", err.error);
});

// ─── Start ────────────────────────────────────────────────────────────────────

export async function startTelegramBot(): Promise<void> {
  // Set command list — non-fatal jika timeout (bisa retry manual)
  try {
    await telegramBot.api.setMyCommands([
      { command: "start", description: "Mulai / menu utama" },
      { command: "topup", description: "Top up game" },
      { command: "riwayat", description: "5 transaksi terakhir" },
      { command: "poin", description: "Cek saldo poin" },
      { command: "feedback", description: "Kirim kritik, saran, atau laporan" },
    ]);
  } catch (err) {
    console.warn("[telegram-bot] setMyCommands gagal (akan dicoba ulang saat restart):", err);
  }

  // Gunakan long polling (bukan webhook) untuk development
  // Di production, ganti dengan webhook via setWebhook()
  telegramBot.start({
    onStart: (info) => {
      console.info(`[telegram-bot] Bot @${info.username} berjalan.`);
    },
  });
}

export async function stopTelegramBot(): Promise<void> {
  await telegramBot.stop();
}
