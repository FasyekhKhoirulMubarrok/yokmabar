import { InlineKeyboard, type Bot } from "grammy";
import { db } from "../../db/client.js";
import { getRecentOrders, formatOrderHistory } from "../../services/history.service.js";
import { getPointSummary } from "../../services/point.service.js";
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
