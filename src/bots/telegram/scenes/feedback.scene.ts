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
    `<i>Kirim /batal untuk membatalkan.</i>`,
    { parse_mode: "HTML" },
  );

  const msgCtx = await conversation.waitFor("message:text", {
    otherwise: (c) => c.reply("😊 Kirim pesan teks ya!"),
  });

  const message = msgCtx.message.text.trim();

  if (message === "/batal") {
    await ctx.reply("😊 Feedback dibatalkan.");
    return;
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
