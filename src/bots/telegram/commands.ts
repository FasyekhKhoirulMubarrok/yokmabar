import { InlineKeyboard, type Bot } from "grammy";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { getRecentOrders, formatOrderHistory } from "../../services/history.service.js";
import { getPointSummary } from "../../services/point.service.js";
import { getFeedbackWithUser, addAdminReply, addUserReply, closeFeedback, normalizeTicketId } from "../../services/feedback.service.js";
import { notifyUserFeedbackReply, notifyAdminFeedbackUserReply, notifyUserFeedbackClosed } from "../../services/notification.service.js";
import {
  listEvents, getEventByShortId, createEvent, startEvent, stopEvent, deleteEvent,
} from "../../services/event.service.js";
import { type PriceEvent } from "@prisma/client";
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

// ─── Admin: Event Management ──────────────────────────────────────────────────

const EVENT_CREATE_KEY = (chatId: string) => `tg:event_create:${chatId}`;
const EVENT_CREATE_TTL = 300; // 5 menit

interface EventCreateState {
  step: "name" | "display_rate" | "scope_value" | "end_date";
  name?: string;
  displayMarkupRate?: number;
  scope?: "ALL" | "BRAND";
  scopeValue?: string;
}

function formatEventStatus(event: PriceEvent): string {
  const status = event.isActive ? "🟢 AKTIF" : "⚫ TIDAK AKTIF";
  const scope = event.scope === "ALL"
    ? "Semua Game"
    : `Game: ${event.scopeValue ?? "-"}`;
  const endDate = event.endAt !== null
    ? `Berakhir: ${new Date(event.endAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}`
    : "Berakhir: Manual stop";
  const displayPct = Math.round(event.displayMarkupRate * 100);
  const actualPct = Math.round(event.actualMarkupRate * 100);
  return `*${event.name}* ${status}\nDiskon tampil: ${displayPct}% | Bayar: ${actualPct}% | ${scope}\n${endDate}\nID: \`${event.id.slice(0, 8)}\``;
}

async function showEventList(ctx: { reply: (text: string, opts?: object) => Promise<unknown> }): Promise<void> {
  const events = await listEvents();

  if (events.length === 0) {
    const keyboard = { inline_keyboard: [[{ text: "➕ Buat Event Baru", callback_data: "event:create" }]] };
    await ctx.reply("📋 Belum ada event. Buat event baru yuk!", { parse_mode: "Markdown", reply_markup: keyboard });
    return;
  }

  const lines = events.map((e, i) => `${i + 1}. ${formatEventStatus(e)}`).join("\n\n");
  const buttons = events.flatMap((e) => {
    const shortId = e.id.slice(0, 8);
    const row = [];
    if (!e.isActive) row.push({ text: `▶️ Start #${shortId}`, callback_data: `event_start:${shortId}` });
    else row.push({ text: `⏹ Stop #${shortId}`, callback_data: `event_stop:${shortId}` });
    row.push({ text: `🗑 Hapus #${shortId}`, callback_data: `event_del:${shortId}` });
    return [row];
  });
  buttons.push([{ text: "➕ Buat Event Baru", callback_data: "event:create" }]);

  await ctx.reply(
    `📋 *Daftar Event Harga:*\n\n${lines}`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } },
  );
}

export function registerAdminEventHandler(bot: Bot<BotContext>): void {
  // ── /event → tampilkan list ────────────────────────────────────────────────
  bot.command("event", async (ctx) => {
    if (ctx.chat?.id.toString() !== config.TELEGRAM_ADMIN_CHAT_ID) return;
    await showEventList(ctx);
  });

  // ── Mulai buat event baru ──────────────────────────────────────────────────
  bot.callbackQuery("event:create", async (ctx) => {
    if (ctx.chat?.id.toString() !== config.TELEGRAM_ADMIN_CHAT_ID) {
      await ctx.answerCallbackQuery("Hanya admin.");
      return;
    }
    const chatId = ctx.chat.id.toString();
    await ctx.answerCallbackQuery();
    const state: EventCreateState = { step: "name" };
    await redis.set(EVENT_CREATE_KEY(chatId), JSON.stringify(state), "EX", EVENT_CREATE_TTL);
    await ctx.reply("✏️ Ketik *nama event* (contoh: Diskon Lebaran):\n_/batal untuk batal_", { parse_mode: "Markdown" });
  });

  // ── Pilih scope ────────────────────────────────────────────────────────────
  bot.callbackQuery("event_scope:all", async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (chatId !== config.TELEGRAM_ADMIN_CHAT_ID) { await ctx.answerCallbackQuery("Hanya admin."); return; }
    await ctx.answerCallbackQuery();
    const raw = await redis.get(EVENT_CREATE_KEY(chatId));
    if (raw === null) { await ctx.reply("😅 Sesi pembuatan event kadaluarsa. Ulangi /event."); return; }
    const state = JSON.parse(raw) as EventCreateState;
    const next: EventCreateState = { ...state, step: "end_date", scope: "ALL" };
    await redis.set(EVENT_CREATE_KEY(chatId), JSON.stringify(next), "EX", EVENT_CREATE_TTL);
    await ctx.reply(
      "📅 Tanggal berakhir event? Format: `DD/MM/YYYY`\nAtau ketik `skip` untuk stop manual.",
      { parse_mode: "Markdown" },
    );
  });

  bot.callbackQuery("event_scope:brand", async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (chatId !== config.TELEGRAM_ADMIN_CHAT_ID) { await ctx.answerCallbackQuery("Hanya admin."); return; }
    await ctx.answerCallbackQuery();
    const raw = await redis.get(EVENT_CREATE_KEY(chatId));
    if (raw === null) { await ctx.reply("😅 Sesi pembuatan event kadaluarsa. Ulangi /event."); return; }
    const state = JSON.parse(raw) as EventCreateState;
    const next: EventCreateState = { ...state, step: "scope_value", scope: "BRAND" };
    await redis.set(EVENT_CREATE_KEY(chatId), JSON.stringify(next), "EX", EVENT_CREATE_TTL);
    await ctx.reply("🎮 Ketik nama game (contoh: `Free Fire`, `Mobile Legends`):", { parse_mode: "Markdown" });
  });

  // ── Konfirmasi buat event ──────────────────────────────────────────────────
  bot.callbackQuery(/^event_confirm:.+$/, async (ctx) => {
    const chatId = ctx.chat?.id.toString();
    if (chatId !== config.TELEGRAM_ADMIN_CHAT_ID) { await ctx.answerCallbackQuery("Hanya admin."); return; }
    await ctx.answerCallbackQuery();
    const raw = await redis.get(EVENT_CREATE_KEY(chatId));
    if (raw === null) { await ctx.reply("😅 Sesi pembuatan event kadaluarsa."); return; }
    await redis.del(EVENT_CREATE_KEY(chatId));

    const action = ctx.callbackQuery.data.replace("event_confirm:", "");
    if (action === "cancel") { await ctx.reply("😊 Pembuatan event dibatalkan."); return; }

    const state = JSON.parse(raw) as EventCreateState & { endAtStr?: string };
    if (state.name === undefined || state.displayMarkupRate === undefined || state.scope === undefined) {
      await ctx.reply("😅 Data event tidak lengkap. Ulangi /event.");
      return;
    }

    let endAt: Date | undefined;
    if (state.endAtStr !== undefined) {
      const [dd, mm, yyyy] = state.endAtStr.split("/").map(Number);
      endAt = new Date(yyyy!, (mm! - 1), dd!, 23, 59, 59);
    }

    try {
      const event = await createEvent({
        name: state.name,
        displayMarkupRate: state.displayMarkupRate,
        actualMarkupRate: config.PRICE_EVENT_RATE,
        scope: state.scope,
        ...(state.scopeValue !== undefined && { scopeValue: state.scopeValue }),
        ...(endAt !== undefined && { endAt }),
      });

      if (action === "active") await startEvent(event.id);

      const statusMsg = action === "active" ? "✅ Event *aktif* sekarang!" : "📋 Event dibuat (belum aktif). Gunakan ▶️ Start untuk mengaktifkan.";
      await ctx.reply(
        `${statusMsg}\n\n${formatEventStatus({ ...event, isActive: action === "active" })}`,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      console.error("[telegram-admin] createEvent error:", err);
      await ctx.reply("😅 Gagal membuat event. Coba lagi ya!");
    }
  });

  // ── Start / Stop / Delete event ────────────────────────────────────────────
  bot.callbackQuery(/^event_start:.+$/, async (ctx) => {
    if (ctx.chat?.id.toString() !== config.TELEGRAM_ADMIN_CHAT_ID) { await ctx.answerCallbackQuery("Hanya admin."); return; }
    await ctx.answerCallbackQuery();
    const shortId = ctx.callbackQuery.data.replace("event_start:", "");
    const event = await getEventByShortId(shortId);
    if (event === null) { await ctx.reply("😅 Event tidak ditemukan."); return; }
    await startEvent(event.id);
    await ctx.reply(`✅ Event *${event.name}* berhasil diaktifkan! 🚀`, { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^event_stop:.+$/, async (ctx) => {
    if (ctx.chat?.id.toString() !== config.TELEGRAM_ADMIN_CHAT_ID) { await ctx.answerCallbackQuery("Hanya admin."); return; }
    await ctx.answerCallbackQuery();
    const shortId = ctx.callbackQuery.data.replace("event_stop:", "");
    const event = await getEventByShortId(shortId);
    if (event === null) { await ctx.reply("😅 Event tidak ditemukan."); return; }
    await stopEvent(event.id);
    await ctx.reply(`⏹ Event *${event.name}* dihentikan.`, { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^event_del:.+$/, async (ctx) => {
    if (ctx.chat?.id.toString() !== config.TELEGRAM_ADMIN_CHAT_ID) { await ctx.answerCallbackQuery("Hanya admin."); return; }
    await ctx.answerCallbackQuery();
    const shortId = ctx.callbackQuery.data.replace("event_del:", "");
    const event = await getEventByShortId(shortId);
    if (event === null) { await ctx.reply("😅 Event tidak ditemukan."); return; }
    const keyboard = {
      inline_keyboard: [[
        { text: "✅ Ya, hapus", callback_data: `event_del_confirm:${shortId}` },
        { text: "❌ Batal",     callback_data: "event_del_abort" },
      ]],
    };
    await ctx.reply(`⚠️ Hapus event *${event.name}*? Tindakan ini tidak bisa dibatalkan.`, { parse_mode: "Markdown", reply_markup: keyboard });
  });

  bot.callbackQuery(/^event_del_confirm:.+$/, async (ctx) => {
    if (ctx.chat?.id.toString() !== config.TELEGRAM_ADMIN_CHAT_ID) { await ctx.answerCallbackQuery("Hanya admin."); return; }
    await ctx.answerCallbackQuery();
    const shortId = ctx.callbackQuery.data.replace("event_del_confirm:", "");
    const event = await getEventByShortId(shortId);
    if (event === null) { await ctx.reply("😅 Event tidak ditemukan."); return; }
    await deleteEvent(event.id);
    await ctx.reply(`🗑 Event *${event.name}* berhasil dihapus.`, { parse_mode: "Markdown" });
  });

  bot.callbackQuery("event_del_abort", async (ctx) => {
    await ctx.answerCallbackQuery("Dibatalkan.");
  });

  // ── Teks masuk — cek state pembuatan event ─────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const chatId = ctx.chat.id.toString();
    if (chatId !== config.TELEGRAM_ADMIN_CHAT_ID) { await next(); return; }

    const text = ctx.message.text.trim();
    if (text.startsWith("/")) { await next(); return; }

    const raw = await redis.get(EVENT_CREATE_KEY(chatId));
    if (raw === null) { await next(); return; }

    if (text === "/batal" || text === "batal") {
      await redis.del(EVENT_CREATE_KEY(chatId));
      await ctx.reply("😊 Pembuatan event dibatalkan.");
      return;
    }

    const state = JSON.parse(raw) as EventCreateState & { endAtStr?: string };

    if (state.step === "name") {
      if (text.length < 3) { await ctx.reply("😊 Nama event minimal 3 karakter ya!"); return; }
      const next2: EventCreateState = { ...state, step: "display_rate", name: text };
      await redis.set(EVENT_CREATE_KEY(chatId), JSON.stringify(next2), "EX", EVENT_CREATE_TTL);
      await ctx.reply(
        `✏️ Harga tampil (markup %) — ini harga *coret palsu* yang ditampilkan ke user.\n` +
        `Contoh: ketik \`14\` untuk +14% di atas modal.\n` +
        `_(User akan melihat harga coret +14%, lalu "diskon" ke harga normal +3%)_`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    if (state.step === "display_rate") {
      const rate = parseFloat(text.replace(",", "."));
      if (isNaN(rate) || rate <= 0 || rate > 100) {
        await ctx.reply("😊 Masukkan angka persentase yang valid (contoh: `14`).", { parse_mode: "Markdown" });
        return;
      }
      const next2: EventCreateState = { ...state, step: "scope" as EventCreateState["step"], displayMarkupRate: rate / 100 };
      await redis.set(EVENT_CREATE_KEY(chatId), JSON.stringify(next2), "EX", EVENT_CREATE_TTL);
      const keyboard = {
        inline_keyboard: [[
          { text: "🌐 Semua Game", callback_data: "event_scope:all" },
          { text: "🎮 Satu Game",  callback_data: "event_scope:brand" },
        ]],
      };
      await ctx.reply("🎮 Event berlaku untuk:", { reply_markup: keyboard });
      return;
    }

    if (state.step === "scope_value") {
      const next2: EventCreateState = { ...state, step: "end_date", scope: "BRAND", scopeValue: text };
      await redis.set(EVENT_CREATE_KEY(chatId), JSON.stringify(next2), "EX", EVENT_CREATE_TTL);
      await ctx.reply(
        "📅 Tanggal berakhir event? Format: `DD/MM/YYYY`\nAtau ketik `skip` untuk stop manual.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    if (state.step === "end_date") {
      let endAtStr: string | undefined;
      if (text.toLowerCase() !== "skip") {
        // Validasi format DD/MM/YYYY
        const parts = text.split("/");
        if (parts.length !== 3 || parts.some((p) => isNaN(parseInt(p)))) {
          await ctx.reply("😊 Format tanggal tidak valid. Ketik `DD/MM/YYYY` atau `skip`.", { parse_mode: "Markdown" });
          return;
        }
        endAtStr = text;
      }

      const displayPct = Math.round((state.displayMarkupRate ?? 0) * 100);
      const scopeLabel = state.scope === "ALL" ? "Semua Game" : `Game: ${state.scopeValue}`;
      const endLabel = endAtStr !== undefined ? endAtStr : "Manual stop";

      const finalState = { ...state, step: "confirm" as EventCreateState["step"], endAtStr };
      await redis.set(EVENT_CREATE_KEY(chatId), JSON.stringify(finalState), "EX", EVENT_CREATE_TTL);

      const keyboard = {
        inline_keyboard: [[
          { text: "✅ Buat & Aktifkan", callback_data: "event_confirm:active" },
          { text: "📋 Buat (belum aktif)", callback_data: "event_confirm:inactive" },
        ], [
          { text: "❌ Batal", callback_data: "event_confirm:cancel" },
        ]],
      };
      await ctx.reply(
        `📋 *Konfirmasi Event Baru:*\n\n` +
        `Nama      : ${state.name}\n` +
        `Tampil    : +${displayPct}% (harga coret)\n` +
        `Bayar     : +3% (margin event)\n` +
        `Scope     : ${scopeLabel}\n` +
        `Berakhir  : ${endLabel}`,
        { parse_mode: "Markdown", reply_markup: keyboard },
      );
    }
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
