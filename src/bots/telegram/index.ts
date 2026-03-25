import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { config } from "../../config.js";
import { type BotContext, topUpScene } from "./scenes/topup.scene.js";
import {
  registerStartCommand,
  registerTopupCommand,
  registerRiwayatCommand,
  registerPoinCommand,
} from "./commands.js";

// ─── Bot Instance ─────────────────────────────────────────────────────────────

export const telegramBot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

// ─── Middleware ───────────────────────────────────────────────────────────────

// 1. Session — wajib sebelum conversations
telegramBot.use(
  session<Record<string, never>, BotContext>({
    initial: () => ({}),
  }),
);

// 2. Conversations plugin
telegramBot.use(conversations());

// 3. Register scene
telegramBot.use(createConversation(topUpScene, "topUpScene"));

// ─── Commands ─────────────────────────────────────────────────────────────────

registerStartCommand(telegramBot);
registerTopupCommand(telegramBot);
registerRiwayatCommand(telegramBot);
registerPoinCommand(telegramBot);

// ─── Fallback ─────────────────────────────────────────────────────────────────

telegramBot.on("message", async (ctx) => {
  await ctx.reply(
    "😊 Halo! Ketik /start atau /topup untuk mulai top up ya.",
  );
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
