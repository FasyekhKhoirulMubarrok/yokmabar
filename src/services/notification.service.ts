import { Api } from "grammy";
import { REST, Routes } from "discord.js";
import { type Platform, type Order } from "@prisma/client";
import { config } from "../config.js";
import { stripBrandPrefix } from "../utils/formatter.js";

// ─── Clients (lazy-initialized) ───────────────────────────────────────────────

let _telegramApi: Api | null = null;
let _discordRest: REST | null = null;

function getTelegramApi(): Api {
  if (_telegramApi === null) {
    _telegramApi = new Api(config.TELEGRAM_BOT_TOKEN);
  }
  return _telegramApi;
}

function getDiscordRest(): REST {
  if (_discordRest === null) {
    _discordRest = new REST({ version: "10" }).setToken(
      config.DISCORD_BOT_TOKEN,
    );
  }
  return _discordRest;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }) + " WIB";
}

function formatOrderRef(paymentRef: string): string {
  return `#${paymentRef}`;
}

// ─── Platform Senders ─────────────────────────────────────────────────────────

async function sendTelegram(chatId: string, text: string): Promise<void> {
  await getTelegramApi().sendMessage(chatId, text, { parse_mode: "HTML" });
}

async function sendWhatsApp(phone: string, text: string): Promise<void> {
  await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: config.FONNTE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ target: phone, message: text }),
  });
}

async function sendDiscordDm(
  discordUserId: string,
  content: string,
  components?: object[],
): Promise<void> {
  const rest = getDiscordRest();

  const dmChannel = (await rest.post(Routes.userChannels(), {
    body: { recipient_id: discordUserId },
  })) as { id: string };

  await rest.post(Routes.channelMessages(dmChannel.id), {
    body: { content, ...(components !== undefined && { components }) },
  });
}

async function sendDiscordAdminEmbed(embed: object): Promise<void> {
  const rest = getDiscordRest();
  await rest.post(Routes.channelMessages(config.DISCORD_ADMIN_CHANNEL_ID), {
    body: { embeds: [embed] },
  });
}

// ─── User Notifications ───────────────────────────────────────────────────────

/**
 * Kirim tagihan ke user setelah order dibuat.
 * Template: "💳 Tagihan YokMabar ..."
 */
export async function notifyInvoice(
  order: Order,
  platform: Platform,
  platformUserId: string,
  paymentUrl: string,
): Promise<void> {
  const text =
    `💳 <b>Tagihan YokMabar</b>\n` +
    `Nominal  : ${formatRupiah(order.amount)}\n` +
    `Order    : ${formatOrderRef(order.paymentRef ?? "")}\n` +
    `Berlaku  : 15 menit ⏰\n\n` +
    `Selesaikan pembayaran sebelum waktu habis ya!\n` +
    `${paymentUrl}`;

  await sendToUser(platform, platformUserId, text);
}

/**
 * Kirim notif top up berhasil ke user.
 * Template: "🎉 Top up berhasil! ..."
 */
export async function notifySuccess(
  order: Order,
  platform: Platform,
  platformUserId: string,
  pointsEarned: number,
  totalPoints: number,
): Promise<void> {
  const pointLine =
    pointsEarned > 0
      ? `\n+${pointsEarned} poin diterima · Total: ${totalPoints} poin`
      : "";

  const text =
    `🎉 <b>Top up berhasil!</b>\n` +
    `${stripBrandPrefix(order.game, order.itemName)} sudah masuk ke akun kamu.\n` +
    `Cek in-game sekarang dan langsung gas! 🚀` +
    pointLine;

  await sendToUser(platform, platformUserId, text);
}

/**
 * Kirim notif top up gagal ke user.
 * Template: "😔 Top up kamu belum berhasil diproses ..."
 */
export async function notifyFailed(
  order: Order,
  platform: Platform,
  platformUserId: string,
): Promise<void> {
  const text =
    `😔 Top up kamu belum berhasil diproses.\n` +
    `Tim kami sudah mendapat notifikasi dan akan segera menindaklanjuti.\n` +
    `Order : ${formatOrderRef(order.paymentRef ?? "")}`;

  await sendToUser(platform, platformUserId, text);
}

/**
 * Kirim notif order kadaluarsa ke user.
 * Template: "⏰ Waktu pembayaran habis ..."
 */
export async function notifyExpired(
  order: Order,
  platform: Platform,
  platformUserId: string,
): Promise<void> {
  const text =
    `⏰ <b>Waktu pembayaran habis</b>\n` +
    `Pesanan ${formatOrderRef(order.paymentRef ?? "")} sudah kadaluarsa.\n` +
    `Tenang, kamu bisa order lagi kapan saja! 😊`;

  await sendToUser(platform, platformUserId, text);
}

/**
 * Kirim notif bonus referral ke inviter Discord via DM.
 */
export async function notifyReferralBonus(
  discordUserId: string,
  bonusPoints: number,
): Promise<void> {
  const text =
    `🎁 Kamu dapat ${bonusPoints} poin bonus!\n` +
    `Ada pengguna baru yang top up lewat server Discord-mu.\n` +
    `Poin bisa ditukar diskon di transaksi berikutnya. Yok mabar! 🎮`;

  try {
    await sendDiscordDm(discordUserId, text);
  } catch {
    // DM bisa gagal jika user disable DM — abaikan
  }
}

// ─── Admin Notifications ──────────────────────────────────────────────────────

/**
 * Notif admin saat order FAILED.
 * Kirim ke Telegram admin + Discord admin channel.
 * Template sesuai CLAUDE.md — "🚨 ORDER GAGAL".
 */
export async function notifyAdminOrderFailed(
  order: Order,
  platform: Platform,
  username: string | null,
): Promise<void> {
  const waktu = formatDateTime(new Date());
  const orderRef = formatOrderRef(order.paymentRef ?? "");
  const userLabel = username !== null ? `@${username}` : order.gameUserId;

  // Telegram — plain text dengan HTML
  const telegramText =
    `🚨 <b>ORDER GAGAL</b>\n` +
    `Order ID : ${orderRef}\n` +
    `Game     : ${order.game}\n` +
    `Item     : ${order.itemName}\n` +
    `User     : ${userLabel} (${platform})\n` +
    `Game ID  : ${order.gameUserId}\n` +
    `Error    : ${order.adminNote ?? "-"}\n` +
    `Waktu    : ${waktu}`;

  // Discord — embed merah
  const discordEmbed = {
    color: 0xff0000,
    title: "🚨 ORDER GAGAL",
    fields: [
      { name: "Order ID", value: orderRef, inline: true },
      { name: "Game", value: order.game, inline: true },
      { name: "Item", value: stripBrandPrefix(order.game, order.itemName), inline: true },
      { name: "User", value: `${userLabel} (${platform})`, inline: true },
      { name: "Game ID", value: order.gameUserId, inline: true },
      { name: "Error", value: order.adminNote ?? "-", inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "YokMabar Admin" },
  };

  await Promise.allSettled([
    sendTelegram(config.TELEGRAM_ADMIN_CHAT_ID, telegramText),
    sendDiscordAdminEmbed(discordEmbed),
  ]);
}

/**
 * Notif admin saat saldo Digiflazz menipis.
 */
export async function notifyAdminLowBalance(balance: number): Promise<void> {
  const waktu = formatDateTime(new Date());
  const minBalance = config.DIGIFLAZZ_MIN_BALANCE;

  const telegramText =
    `⚠️ <b>SALDO DIGIFLAZZ MENIPIS</b>\n` +
    `Saldo    : ${formatRupiah(balance)}\n` +
    `Minimum  : ${formatRupiah(minBalance)}\n` +
    `Waktu    : ${waktu}\n\n` +
    `Segera top up deposit Digiflazz!`;

  const discordEmbed = {
    color: 0xffa500,
    title: "⚠️ Saldo Digiflazz Menipis",
    fields: [
      { name: "Saldo Saat Ini", value: formatRupiah(balance), inline: true },
      { name: "Batas Minimum", value: formatRupiah(minBalance), inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "YokMabar Admin" },
  };

  await Promise.allSettled([
    sendTelegram(config.TELEGRAM_ADMIN_CHAT_ID, telegramText),
    sendDiscordAdminEmbed(discordEmbed),
  ]);
}

// ─── Feedback Notifications ───────────────────────────────────────────────────

/**
 * Notif semua admin platform saat ada feedback masuk dari user.
 * Kirim ke Telegram admin + Discord admin channel + WhatsApp admin.
 */
export async function notifyAdminFeedback(
  ticketId: string,
  platform: Platform,
  username: string | null,
  message: string,
): Promise<void> {
  const waktu = formatDateTime(new Date());
  const userLabel = username !== null ? `@${username}` : `[${platform}]`;

  const telegramText =
    `📩 <b>Feedback Masuk</b>\n` +
    `Tiket    : <b>#${ticketId}</b>\n` +
    `Platform : ${platform}\n` +
    `User     : ${userLabel}\n` +
    `Pesan    : ${message}\n` +
    `Waktu    : ${waktu}\n\n` +
    `Balas dengan klik tombol di bawah atau ketik:\n` +
    `<code>/reply ${ticketId} [pesan balasan]</code>\n` +
    `Tutup: <code>tutup ${ticketId}</code>`;

  const discordEmbed = {
    color: 0x00b4d8,
    title: "📩 Feedback Masuk",
    fields: [
      { name: "Tiket",    value: `#${ticketId}`,  inline: true },
      { name: "Platform", value: platform,         inline: true },
      { name: "User",     value: userLabel,        inline: true },
      { name: "Pesan",    value: message,          inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "YokMabar Admin" },
  };

  const discordComponents = [{
    type: 1,
    components: [
      { type: 2, style: 1, label: "💬 Balas",       custom_id: `fb_admin_reply|${ticketId}` },
      { type: 2, style: 4, label: "✅ Tutup Tiket", custom_id: `fb_admin_close|${ticketId}` },
    ],
  }];

  const waText =
    `📩 *Feedback Masuk*\n` +
    `Tiket    : *#${ticketId}*\n` +
    `Platform : ${platform}\n` +
    `User     : ${userLabel}\n` +
    `Pesan    : ${message}\n` +
    `Waktu    : ${waktu}\n\n` +
    `Balas via WA dengan format:\n` +
    `reply ${ticketId} [pesan balasan]`;

  await Promise.allSettled([
    getTelegramApi().sendMessage(config.TELEGRAM_ADMIN_CHAT_ID, telegramText, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "💬 Balas",       callback_data: `fb_reply:${ticketId}` },
          { text: "✅ Tutup Tiket", callback_data: `fb_close:${ticketId}` },
        ]],
      },
    }),
    getDiscordRest().post(Routes.channelMessages(config.DISCORD_ADMIN_CHANNEL_ID), {
      body: { embeds: [discordEmbed], components: discordComponents },
    }),
    sendWhatsApp(config.WHATSAPP_ADMIN_NUMBER, waText),
  ]);
}

/**
 * Kirim balasan admin ke user di platform asal mereka.
 * Sertakan tombol/instruksi untuk user bisa balas balik.
 */
export async function notifyUserFeedbackReply(
  platform: Platform,
  platformUserId: string,
  ticketId: string,
  replyMessage: string,
): Promise<void> {
  const plainText =
    `💬 Balasan Admin — Tiket #${ticketId}\n\n` +
    `${replyMessage}\n\n` +
    `Balas: reply ${ticketId} pesan kamu\n` +
    `Tutup: tutup ${ticketId}`;

  const htmlText =
    `💬 <b>Balasan Admin — Tiket #${ticketId}</b>\n\n` +
    `${replyMessage}`;

  switch (platform) {
    case "TELEGRAM":
      await getTelegramApi().sendMessage(platformUserId, htmlText, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "💬 Balas", callback_data: `fb_user_reply:${ticketId}` },
            { text: "✅ Tutup Tiket", callback_data: `fb_user_close:${ticketId}` },
          ]],
        },
      });
      break;
    case "DISCORD":
      await sendDiscordDm(platformUserId, plainText, [{
        type: 1,
        components: [
          { type: 2, style: 1, label: "💬 Balas", custom_id: `fb_user_reply|${ticketId}` },
          { type: 2, style: 3, label: "✅ Tutup Tiket", custom_id: `fb_user_close|${ticketId}` },
        ],
      }]);
      break;
    case "WHATSAPP":
      await sendWhatsApp(platformUserId, plainText);
      break;
  }
}

/**
 * Notif semua admin saat user membalas tiket.
 */
export async function notifyAdminFeedbackUserReply(
  ticketId: string,
  platform: Platform,
  username: string | null,
  message: string,
): Promise<void> {
  const waktu = formatDateTime(new Date());
  const userLabel = username !== null ? `@${username}` : `[${platform}]`;

  const telegramText =
    `💬 <b>User Membalas</b>\n` +
    `Tiket    : <b>#${ticketId}</b>\n` +
    `Platform : ${platform}\n` +
    `User     : ${userLabel}\n` +
    `Pesan    : ${message}\n` +
    `Waktu    : ${waktu}`;

  const discordEmbed = {
    color: 0x57f287,
    title: "💬 User Membalas",
    fields: [
      { name: "Tiket",    value: `#${ticketId}`, inline: true },
      { name: "Platform", value: platform,        inline: true },
      { name: "User",     value: userLabel,       inline: true },
      { name: "Pesan",    value: message,         inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "YokMabar Admin" },
  };

  const discordComponents = [{
    type: 1,
    components: [
      { type: 2, style: 1, label: "💬 Balas",       custom_id: `fb_admin_reply|${ticketId}` },
      { type: 2, style: 4, label: "✅ Tutup Tiket", custom_id: `fb_admin_close|${ticketId}` },
    ],
  }];

  const waText =
    `💬 *User Membalas*\n` +
    `Tiket : *#${ticketId}*\n` +
    `User  : ${userLabel}\n` +
    `Pesan : ${message}\n\n` +
    `Balas: reply ${ticketId} pesan\n` +
    `Tutup: tutup ${ticketId}`;

  await Promise.allSettled([
    getTelegramApi().sendMessage(config.TELEGRAM_ADMIN_CHAT_ID, telegramText, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "💬 Balas",       callback_data: `fb_reply:${ticketId}` },
          { text: "✅ Tutup Tiket", callback_data: `fb_close:${ticketId}` },
        ]],
      },
    }),
    getDiscordRest().post(Routes.channelMessages(config.DISCORD_ADMIN_CHANNEL_ID), {
      body: { embeds: [discordEmbed], components: discordComponents },
    }),
    sendWhatsApp(config.WHATSAPP_ADMIN_NUMBER, waText),
  ]);
}

/**
 * Notif user bahwa tiketnya telah ditutup.
 */
export async function notifyUserFeedbackClosed(
  platform: Platform,
  platformUserId: string,
  ticketId: string,
): Promise<void> {
  const text =
    `✅ Tiket <b>#${ticketId}</b> telah ditutup.\n` +
    `Terima kasih sudah menghubungi YokMabar! 🙏\n` +
    `Buka tiket baru kapan saja lewat /feedback`;

  await sendToUser(platform, platformUserId, text);
}

// ─── Internal Router ──────────────────────────────────────────────────────────

/**
 * Route notif user ke platform yang sesuai.
 * Gagal di satu platform tidak menghentikan platform lain.
 */
async function sendToUser(
  platform: Platform,
  platformUserId: string,
  text: string,
): Promise<void> {
  // Strip HTML tags untuk WhatsApp dan Discord (plain text)
  const plainText = text.replace(/<\/?[^>]+(>|$)/g, "");

  switch (platform) {
    case "TELEGRAM":
      await sendTelegram(platformUserId, text);
      break;
    case "WHATSAPP":
      await sendWhatsApp(platformUserId, plainText);
      break;
    case "DISCORD":
      await sendDiscordDm(platformUserId, plainText);
      break;
  }
}
