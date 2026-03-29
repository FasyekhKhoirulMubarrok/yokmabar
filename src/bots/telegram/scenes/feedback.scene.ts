import { type Context } from "grammy";
import { type Conversation } from "@grammyjs/conversations";
import { type BotContext } from "./topup.scene.js";
import { db } from "../../../db/client.js";
import { createFeedback } from "../../../services/feedback.service.js";
import { notifyAdminFeedback } from "../../../services/notification.service.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateUser(
  telegramId: number,
  username: string | undefined,
): Promise<string> {
  const platformUserId = telegramId.toString();
  const user = await db.user.upsert({
    where: { platform_platformUserId: { platform: "TELEGRAM", platformUserId } },
    create: { platform: "TELEGRAM", platformUserId, username: username ?? null },
    update: { username: username ?? null },
  });
  return user.id;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export async function feedbackScene(
  conversation: Conversation<BotContext, Context>,
  ctx: Context,
): Promise<void> {
  const telegramUser = ctx.from;
  if (telegramUser === undefined) return;

  await ctx.reply(
    `📝 <b>Kirim Feedback</b>\n\n` +
    `Ketik pesan kamu — bisa berupa kritik, saran, atau laporan masalah.\n` +
    `<i>Hanya teks yang diterima. Kirim /batal untuk membatalkan.</i>`,
    { parse_mode: "HTML" },
  );

  let message = "";
  while (true) {
    const msgCtx = await conversation.waitFor("message", {
      otherwise: (c) => c.reply("😊 Hanya pesan teks yang diterima ya!"),
    });

    // Tolak non-teks (foto, stiker, dokumen, dll)
    if (!("text" in msgCtx.message) || msgCtx.message.text === undefined) {
      await ctx.reply(
        `❌ Hanya teks yang bisa dikirim sebagai feedback.\n` +
        `Ketik pesan kamu dalam bentuk teks ya!`,
      );
      continue;
    }

    const raw = msgCtx.message.text.trim();

    if (raw === "/batal") {
      await ctx.reply("😊 Feedback dibatalkan.");
      return;
    }

    if (raw.length < 10) {
      await ctx.reply("😊 Pesan terlalu singkat. Minimal 10 karakter ya — ceritakan lebih detail!");
      continue;
    }

    if (raw.length > 1000) {
      await ctx.reply(`😊 Pesan terlalu panjang (${raw.length}/1000 karakter). Ringkas sedikit ya!`);
      continue;
    }

    message = raw;
    break;
  }

  const userId = await conversation.external(() =>
    getOrCreateUser(telegramUser.id, telegramUser.username),
  );

  const feedback = await conversation.external(() =>
    createFeedback(userId, message),
  );

  await conversation.external(() =>
    notifyAdminFeedback(
      feedback.ticketId,
      "TELEGRAM",
      telegramUser.username ?? null,
      message,
    ),
  );

  await ctx.reply(
    `✅ <b>Feedback diterima!</b>\n\n` +
    `Tiket    : <b>#${feedback.ticketId}</b>\n` +
    `Pesan    : ${message}\n\n` +
    `Tim kami akan segera merespons. Terima kasih! 🙏`,
    { parse_mode: "HTML" },
  );
}
