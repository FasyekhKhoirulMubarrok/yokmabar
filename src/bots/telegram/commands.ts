import { InlineKeyboard, type Bot } from "grammy";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { getRecentOrders, formatOrderHistory } from "../../services/history.service.js";
import { getPointSummary } from "../../services/point.service.js";
import { getFeedbackWithUser, addAdminReply, addUserReply, closeFeedback, normalizeTicketId } from "../../services/feedback.service.js";
import { notifyUserFeedbackReply, notifyAdminFeedbackUserReply, notifyUserFeedbackClosed } from "../../services/notification.service.js";
import { config } from "../../config.js";
import { type BotContext } from "./scenes/topup.scene.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

async function getOrCreateUser(
  telegramId: number,
  username: string | undefined,
): Promise<{ id: string; isNew: boolean }> {
  const platformUserId = telegramId.toString();

  const existing = await db.user.findUnique({
    where: { platform_platformUserId: { platform: "TELEGRAM", platformUserId } },
  });

  if (existing !== null) {
    await db.user.update({
      where: { id: existing.id },
      data: { username: username ?? null },
    });
    return { id: existing.id, isNew: false };
  }

  const created = await db.user.create({
    data: { platform: "TELEGRAM", platformUserId, username: username ?? null },
  });
  return { id: created.id, isNew: true };
}

function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🎮 Top Up", "menu:topup")
    .text("📋 Riwayat", "menu:riwayat")
    .row()
    .text("🎁 Poin Saya", "menu:poin");
}

// ─── /start ───────────────────────────────────────────────────────────────────

export function registerStartCommand(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    const telegramUser = ctx.from;
    if (telegramUser === undefined) return;

    const { isNew } = await getOrCreateUser(
      telegramUser.id,
      telegramUser.username,
    );

    const text = isNew
      ? `🎮 Halo! Selamat datang di YokMabar Bot!\n` +
        `Top up game kamu lebih cepat, langsung dari chat —\n` +
        `tanpa perlu buka web atau aplikasi tambahan.\n\n` +
        `Yok, mulai top up sekarang! 👇`
      : `🎮 Halo lagi! Siap mabar hari ini?\n` +
        `Yok lanjut top up — cepet, aman, langsung gas! 👇`;

    await ctx.reply(text, { reply_markup: mainMenuKeyboard() });
  });

  // Handle tombol menu dari /start
  bot.callbackQuery("menu:topup", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("topUpScene");
  });

  bot.callbackQuery("menu:riwayat", async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramUser = ctx.from;
    if (telegramUser === undefined) return;

    const user = await db.user.findUnique({
      where: {
        platform_platformUserId: {
          platform: "TELEGRAM",
          platformUserId: telegramUser.id.toString(),
        },
      },
    });

    if (user === null) {
      await ctx.editMessageText(
        "😊 Kamu belum punya transaksi. Yok mulai top up!",
      );
      return;
    }

    const orders = await getRecentOrders(user.id);
    await ctx.editMessageText(formatOrderHistory(orders), {
      parse_mode: "HTML",
    });
  });

  bot.callbackQuery("menu:poin", async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramUser = ctx.from;
    if (telegramUser === undefined) return;

    const user = await db.user.findUnique({
      where: {
        platform_platformUserId: {
          platform: "TELEGRAM",
          platformUserId: telegramUser.id.toString(),
        },
      },
    });

    if (user === null) {
      await ctx.editMessageText("😊 Kamu belum punya poin. Yok mulai top up!");
      return;
    }

    const summary = await getPointSummary(user.id);
    const redeemInfo = summary.canRedeem
      ? `\n\nKamu bisa tukar <b>${summary.maxRedeemablePoints} poin</b> untuk hemat <b>${formatRupiah(summary.maxDiscount)}</b>! 🎁`
      : `\n\nKumpulkan 200 poin lagi untuk mulai menukar! 💪`;

    await ctx.editMessageText(
      `🎁 <b>Poin Kamu</b>\n\n` +
        `Saldo aktif : <b>${summary.activePoints} poin</b>` +
        redeemInfo,
      { parse_mode: "HTML" },
    );
  });
}

// ─── /topup ───────────────────────────────────────────────────────────────────

export function registerTopupCommand(bot: Bot<BotContext>): void {
  bot.command("topup", async (ctx) => {
    await ctx.conversation.enter("topUpScene");
  });
}

// ─── /riwayat ─────────────────────────────────────────────────────────────────

export function registerRiwayatCommand(bot: Bot<BotContext>): void {
  bot.command("riwayat", async (ctx) => {
    const telegramUser = ctx.from;
    if (telegramUser === undefined) return;

    const user = await db.user.findUnique({
      where: {
        platform_platformUserId: {
          platform: "TELEGRAM",
          platformUserId: telegramUser.id.toString(),
        },
      },
    });

    if (user === null) {
      await ctx.reply("😊 Kamu belum punya transaksi. Yok mulai top up!");
      return;
    }

    const orders = await getRecentOrders(user.id);
    await ctx.reply(formatOrderHistory(orders), { parse_mode: "HTML" });
  });
}

// ─── /feedback ───────────────────────────────────────────────────────────────

export function registerFeedbackCommand(bot: Bot<BotContext>): void {
  bot.command("feedback", async (ctx) => {
    await ctx.conversation.enter("feedbackScene");
  });
}

// ─── Admin: Reply Feedback ────────────────────────────────────────────────────

const ADMIN_REPLY_KEY = (chatId: string) => `tg:admin_reply:${chatId}`;

export function registerAdminFeedbackReplyHandler(bot: Bot<BotContext>): void {
  // ── Admin: klik [💬 Balas] ──────────────────────────────────────────────────
  bot.callbackQuery(/^fb_reply:.+$/, async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (chatId !== config.TELEGRAM_ADMIN_CHAT_ID) {
      await ctx.answerCallbackQuery("Hanya admin yang bisa membalas.");
      return;
    }
    const ticketId = ctx.callbackQuery.data.replace("fb_reply:", "");
    await ctx.answerCallbackQuery();
    await redis.set(ADMIN_REPLY_KEY(chatId), ticketId, "EX", 300);
    await ctx.reply(
      `✏️ Ketik balasan untuk tiket <b>#${ticketId}</b>:\n<i>Kirim /batal untuk membatalkan.</i>`,
      { parse_mode: "HTML" },
    );
  });

  // ── Admin: klik [✅ Tutup Tiket] ────────────────────────────────────────────
  bot.callbackQuery(/^fb_close:.+$/, async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (chatId !== config.TELEGRAM_ADMIN_CHAT_ID) {
      await ctx.answerCallbackQuery("Hanya admin yang bisa menutup tiket.");
      return;
    }
    await ctx.answerCallbackQuery();
    const ticketId = ctx.callbackQuery.data.replace("fb_close:", "");
    await handleCloseFeedback(ctx, ticketId, true);
  });

  // ── User: klik [💬 Balas] dari notifikasi admin ─────────────────────────────
  bot.callbackQuery(/^fb_user_reply:.+$/, async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (chatId === undefined) return;
    const ticketId = ctx.callbackQuery.data.replace("fb_user_reply:", "");
    await ctx.answerCallbackQuery();
    await redis.set(`tg:user_reply:${chatId}`, ticketId, "EX", 300);
    await ctx.reply(
      `✏️ Ketik balasan untuk tiket <b>#${ticketId}</b>:\n<i>Kirim /batal untuk membatalkan.</i>`,
      { parse_mode: "HTML" },
    );
  });

  // ── Pesan teks — cek pending reply (admin atau user) ────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const chatId = ctx.chat.id.toString();
    const text = ctx.message.text;

    if (text.startsWith("/")) { await next(); return; }

    const isAdmin = chatId === config.TELEGRAM_ADMIN_CHAT_ID;
    const pendingKey = isAdmin ? ADMIN_REPLY_KEY(chatId) : `tg:user_reply:${chatId}`;
    const pendingTicket = await redis.get(pendingKey);

    if (pendingTicket === null) { await next(); return; }

    await redis.del(pendingKey);

    try {
      const feedback = await getFeedbackWithUser(pendingTicket);
      if (feedback === null) { await ctx.reply(`😅 Tiket #${pendingTicket} tidak ditemukan.`); return; }

      if (feedback.status === "CLOSED") {
        await ctx.reply(`😊 Tiket <b>#${pendingTicket}</b> sudah ditutup. Buka tiket baru dengan /feedback.`, { parse_mode: "HTML" });
        return;
      }

      if (isAdmin) {
        await addAdminReply(pendingTicket, text);
        await notifyUserFeedbackReply(feedback.user.platform, feedback.user.platformUserId, pendingTicket, text);
        await ctx.reply(`✅ Balasan untuk <b>#${pendingTicket}</b> terkirim ke ${feedback.user.platform}!`, { parse_mode: "HTML" });
      } else {
        await addUserReply(pendingTicket, text);
        await notifyAdminFeedbackUserReply(pendingTicket, feedback.user.platform, feedback.user.username ?? null, text);
        await ctx.reply(`✅ Balasan kamu untuk tiket <b>#${pendingTicket}</b> sudah dikirim ke admin!`, { parse_mode: "HTML" });
      }
    } catch (err) {
      console.error("[telegram] feedback reply error:", err);
      await ctx.reply("😅 Gagal mengirim balasan. Coba lagi ya!");
    }
  });
}

async function handleCloseFeedback(ctx: { reply: (text: string, opts?: object) => Promise<unknown> }, ticketId: string, isAdmin: boolean): Promise<void> {
  try {
    const feedback = await getFeedbackWithUser(ticketId);
    if (feedback === null) { await ctx.reply(`😅 Tiket #${ticketId} tidak ditemukan.`); return; }
    if (feedback.status === "CLOSED") { await ctx.reply(`😊 Tiket #${ticketId} sudah ditutup sebelumnya.`); return; }

    await closeFeedback(ticketId);

    if (isAdmin) {
      await notifyUserFeedbackClosed(feedback.user.platform, feedback.user.platformUserId, ticketId);
      await ctx.reply(`✅ Tiket <b>#${ticketId}</b> ditutup dan user sudah dinotifikasi.`, { parse_mode: "HTML" });
    } else {
      await ctx.reply(`✅ Tiket <b>#${ticketId}</b> berhasil ditutup. Terima kasih! 🙏`, { parse_mode: "HTML" });
    }
  } catch (err) {
    console.error("[telegram] close feedback error:", err);
    await ctx.reply("😅 Gagal menutup tiket. Coba lagi ya!");
  }
}

// ─── /poin ────────────────────────────────────────────────────────────────────

export function registerPoinCommand(bot: Bot<BotContext>): void {
  bot.command("poin", async (ctx) => {
    const telegramUser = ctx.from;
    if (telegramUser === undefined) return;

    const user = await db.user.findUnique({
      where: {
        platform_platformUserId: {
          platform: "TELEGRAM",
          platformUserId: telegramUser.id.toString(),
        },
      },
    });

    if (user === null) {
      await ctx.reply("😊 Kamu belum punya poin. Yok mulai top up!");
      return;
    }

    const summary = await getPointSummary(user.id);
    const redeemInfo = summary.canRedeem
      ? `\n\nKamu bisa tukar <b>${summary.maxRedeemablePoints} poin</b> untuk hemat <b>${formatRupiah(summary.maxDiscount)}</b>! 🎁`
      : `\n\nKumpulkan 200 poin lagi untuk mulai menukar! 💪`;

    await ctx.reply(
      `🎁 <b>Poin Kamu</b>\n\n` +
        `Saldo aktif : <b>${summary.activePoints} poin</b>` +
        redeemInfo,
      { parse_mode: "HTML" },
    );
  });
}
