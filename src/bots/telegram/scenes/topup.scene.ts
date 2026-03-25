import { InlineKeyboard, type Context, type SessionFlavor } from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
} from "@grammyjs/conversations";
import { db } from "../../../db/client.js";
import { getPopularBrands, getProductsByBrand, searchProducts } from "../../../services/product.service.js";
import { getPointSummary, redeemPoints } from "../../../services/point.service.js";
import { createOrder, setPaymentUrl } from "../../../services/order.service.js";
import { createInvoice, type PaymentMethod } from "../../../services/payment.service.js";
import { scheduleOrderExpiry } from "../../../jobs/queue.js";
import { type Product } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotContext = ConversationFlavor<Context & SessionFlavor<Record<string, never>>>;
export type TopUpConversation = Conversation<BotContext, Context>;

// ─── Constants ────────────────────────────────────────────────────────────────

// Game yang butuh Server ID
const GAMES_NEED_SERVER_ID = new Set([
  "Mobile Legends",
  "Genshin Impact",
  "Honkai: Star Rail",
]);

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  QRIS: "💳 QRIS",
  GOPAY: "💚 GoPay",
  OVO: "💜 OVO",
  DANA: "💙 Dana",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

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

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Step 1: Pilih Game ───────────────────────────────────────────────────────

async function stepSelectGame(
  conversation: TopUpConversation,
  ctx: Context,
): Promise<string | null> {
  const popularBrands = await conversation.external(() => getPopularBrands());

  const keyboard = new InlineKeyboard();
  const rows = chunkArray(popularBrands, 2);
  for (const row of rows) {
    for (const brand of row) {
      keyboard.text(brand, `game:${brand}`);
    }
    keyboard.row();
  }
  keyboard.text("🔍 Cari game lain...", "game:search");

  await ctx.reply(
    "🎮 <b>Pilih game yang mau di-top up:</b>",
    { reply_markup: keyboard, parse_mode: "HTML" },
  );

  const cb = await conversation.waitForCallbackQuery(/^game:.+$/, {
    otherwise: (c) => c.reply("😊 Tap salah satu tombol game ya!"),
  });
  await cb.answerCallbackQuery();

  const value = cb.callbackQuery.data.replace("game:", "");
  if (value === "search") return null; // lanjut ke step search

  return value;
}

// ─── Step 2: Cari Game ────────────────────────────────────────────────────────

async function stepSearchGame(
  conversation: TopUpConversation,
  ctx: Context,
): Promise<string | null> {
  await ctx.reply("🔍 Ketik nama game yang kamu cari:");

  const textCtx = await conversation.waitFor("message:text", {
    otherwise: (c) => c.reply("😊 Ketik nama game ya!"),
  });

  const query = textCtx.message.text.trim();
  const results = await conversation.external(() => searchProducts(query));

  if (results.length === 0) {
    await ctx.reply(`😅 Game "<b>${query}</b>" tidak ditemukan. Coba kata kunci lain!`, {
      parse_mode: "HTML",
    });
    return null;
  }

  // Ambil brand unik dari hasil search
  const brands = [...new Set(results.map((p) => p.brand))].slice(0, 8);
  const keyboard = new InlineKeyboard();
  const rows = chunkArray(brands, 2);
  for (const row of rows) {
    for (const brand of row) {
      keyboard.text(brand, `brand:${brand}`);
    }
    keyboard.row();
  }
  keyboard.text("🔍 Cari lagi", "brand:search_again");

  await ctx.reply(
    `🎮 <b>Hasil pencarian "${query}":</b>`,
    { reply_markup: keyboard, parse_mode: "HTML" },
  );

  const cb = await conversation.waitForCallbackQuery(/^brand:.+$/, {
    otherwise: (c) => c.reply("😊 Tap salah satu game ya!"),
  });
  await cb.answerCallbackQuery();

  const value = cb.callbackQuery.data.replace("brand:", "");
  if (value === "search_again") return null;

  return value;
}

// ─── Step 3: Pilih Nominal ────────────────────────────────────────────────────

async function stepSelectNominal(
  conversation: TopUpConversation,
  ctx: Context,
  brand: string,
): Promise<Product | null> {
  const products = await conversation.external(() => getProductsByBrand(brand));

  if (products.length === 0) {
    await ctx.reply(`😅 Produk ${brand} belum tersedia saat ini.`);
    return null;
  }

  const keyboard = new InlineKeyboard();
  const rows = chunkArray(products.slice(0, 20), 2);
  for (const row of rows) {
    for (const product of row) {
      const label = `${product.itemName} — ${formatRupiah(product.price)}`;
      keyboard.text(label, `item:${product.itemCode}`);
    }
    keyboard.row();
  }
  keyboard.text("❌ Batal", "item:cancel");

  await ctx.reply(
    `💎 <b>Pilih nominal ${brand}:</b>`,
    { reply_markup: keyboard, parse_mode: "HTML" },
  );

  const cb = await conversation.waitForCallbackQuery(/^item:.+$/, {
    otherwise: (c) => c.reply("😊 Tap nominal yang kamu mau ya!"),
  });
  await cb.answerCallbackQuery();

  const itemCode = cb.callbackQuery.data.replace("item:", "");
  if (itemCode === "cancel") return null;

  return products.find((p) => p.itemCode === itemCode) ?? null;
}

// ─── Step 4: Input User ID ────────────────────────────────────────────────────

async function stepInputUserId(
  conversation: TopUpConversation,
  ctx: Context,
  brand: string,
): Promise<{ gameUserId: string; gameServerId: string | null }> {
  const needsServer = GAMES_NEED_SERVER_ID.has(brand);

  await ctx.reply(
    needsServer
      ? `🆔 Masukkan <b>User ID</b> ${brand} kamu:\n<i>Contoh: 123456789</i>`
      : `🆔 Masukkan <b>ID akun</b> ${brand} kamu:`,
    { parse_mode: "HTML" },
  );

  const idCtx = await conversation.waitFor("message:text", {
    otherwise: (c) => c.reply("😊 Kirim User ID kamu ya (text saja)!"),
  });
  const gameUserId = idCtx.message.text.trim();

  if (!needsServer) {
    return { gameUserId, gameServerId: null };
  }

  await ctx.reply(
    `🌐 Sekarang masukkan <b>Server ID</b> kamu:\n<i>Contoh: 1234 (4 digit di belakang User ID)</i>`,
    { parse_mode: "HTML" },
  );

  const serverCtx = await conversation.waitFor("message:text", {
    otherwise: (c) => c.reply("😊 Kirim Server ID kamu ya!"),
  });
  const gameServerId = serverCtx.message.text.trim();

  return { gameUserId, gameServerId };
}

// ─── Step 5: Konfirmasi ───────────────────────────────────────────────────────

async function stepConfirm(
  conversation: TopUpConversation,
  ctx: Context,
  product: Product,
  gameUserId: string,
  gameServerId: string | null,
): Promise<boolean> {
  const idLine = gameServerId
    ? `Game ID  : ${gameUserId} (Server: ${gameServerId})`
    : `Game ID  : ${gameUserId}`;

  const text =
    `📋 <b>Konfirmasi Order</b>\n\n` +
    `Game     : ${product.brand}\n` +
    `Item     : ${product.itemName}\n` +
    `Harga    : ${formatRupiah(product.price)}\n` +
    `${idLine}\n\n` +
    `Pastikan ID sudah benar ya!`;

  const keyboard = new InlineKeyboard()
    .text("✅ Konfirmasi", "confirm:yes")
    .text("❌ Batal", "confirm:no");

  await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });

  const cb = await conversation.waitForCallbackQuery(/^confirm:.+$/, {
    otherwise: (c) => c.reply("😊 Tap Konfirmasi atau Batal ya!"),
  });
  await cb.answerCallbackQuery();

  return cb.callbackQuery.data === "confirm:yes";
}

// ─── Step 6: Tawaran Poin ─────────────────────────────────────────────────────

async function stepOfferPoints(
  conversation: TopUpConversation,
  ctx: Context,
  userId: string,
  productPrice: number,
): Promise<number> {
  const summary = await conversation.external(() => getPointSummary(userId));
  if (!summary.canRedeem) return 0;

  const keyboard = new InlineKeyboard()
    .text(`💰 Pakai ${summary.maxRedeemablePoints} poin (hemat ${formatRupiah(summary.maxDiscount)})`, "points:use")
    .row()
    .text("➡️ Lewati", "points:skip");

  await ctx.reply(
    `🎁 Kamu punya <b>${summary.activePoints} poin</b>!\n` +
      `Mau pakai ${summary.maxRedeemablePoints} poin untuk hemat <b>${formatRupiah(summary.maxDiscount)}</b>?`,
    { reply_markup: keyboard, parse_mode: "HTML" },
  );

  const cb = await conversation.waitForCallbackQuery(/^points:.+$/, {
    otherwise: (c) => c.reply("😊 Pilih opsi poin ya!"),
  });
  await cb.answerCallbackQuery();

  if (cb.callbackQuery.data === "points:skip") return 0;

  // Tukar poin → return nilai diskon
  const discount = await conversation.external(() =>
    redeemPoints(userId, summary.maxRedeemablePoints),
  );
  return discount;
}

// ─── Step 7: Pilih Metode Bayar ───────────────────────────────────────────────

async function stepSelectPayment(
  conversation: TopUpConversation,
  ctx: Context,
  finalAmount: number,
): Promise<PaymentMethod | null> {
  const keyboard = new InlineKeyboard();
  const methods = Object.entries(PAYMENT_LABELS) as [PaymentMethod, string][];
  for (const [method, label] of methods) {
    keyboard.text(label, `pay:${method}`).row();
  }
  keyboard.text("❌ Batal", "pay:cancel");

  await ctx.reply(
    `💳 <b>Pilih metode pembayaran</b>\nTotal: <b>${formatRupiah(finalAmount)}</b>`,
    { reply_markup: keyboard, parse_mode: "HTML" },
  );

  const cb = await conversation.waitForCallbackQuery(/^pay:.+$/, {
    otherwise: (c) => c.reply("😊 Pilih metode pembayaran ya!"),
  });
  await cb.answerCallbackQuery();

  const method = cb.callbackQuery.data.replace("pay:", "") as PaymentMethod | "cancel";
  if (method === "cancel") return null;

  return method;
}

// ─── Main Scene ───────────────────────────────────────────────────────────────

export async function topUpScene(
  conversation: TopUpConversation,
  ctx: Context,
): Promise<void> {
  const telegramUser = ctx.from;
  if (telegramUser === undefined) return;

  // Dapatkan/buat user di DB
  const userId = await conversation.external(() =>
    getOrCreateUser(telegramUser.id, telegramUser.username),
  );

  // ── Step 1: Pilih game ──────────────────────────────────────────────────────
  let brand = await stepSelectGame(conversation, ctx);

  // ── Step 2: Search jika tap 🔍 ──────────────────────────────────────────────
  if (brand === null) {
    brand = await stepSearchGame(conversation, ctx);
    if (brand === null) {
      await ctx.reply("😊 Ketik /topup untuk mulai lagi ya!");
      return;
    }
  }

  // ── Step 3: Pilih nominal ───────────────────────────────────────────────────
  const product = await stepSelectNominal(conversation, ctx, brand);
  if (product === null) {
    await ctx.reply("😊 Order dibatalkan. Ketik /topup untuk mulai lagi!");
    return;
  }

  // ── Step 4: Input User ID (+ Server ID jika perlu) ─────────────────────────
  const { gameUserId, gameServerId } = await stepInputUserId(conversation, ctx, brand);

  // ── Step 5: Konfirmasi ──────────────────────────────────────────────────────
  const confirmed = await stepConfirm(conversation, ctx, product, gameUserId, gameServerId);
  if (!confirmed) {
    await ctx.reply("😊 Order dibatalkan. Ketik /topup untuk mulai lagi!");
    return;
  }

  // ── Step 6: Tawaran poin ────────────────────────────────────────────────────
  const pointDiscount = await stepOfferPoints(conversation, ctx, userId, product.price);
  const finalAmount = Math.max(product.price - pointDiscount, 0);

  // ── Step 7: Pilih metode bayar ──────────────────────────────────────────────
  const paymentMethod = await stepSelectPayment(conversation, ctx, finalAmount);
  if (paymentMethod === null) {
    await ctx.reply("😊 Order dibatalkan. Ketik /topup untuk mulai lagi!");
    return;
  }

  // ── Step 8: Buat order + invoice ────────────────────────────────────────────
  await ctx.reply("⏳ Membuat tagihan...");

  const order = await conversation.external(() =>
    createOrder({
      userId,
      game: brand!,
      gameUserId,
      ...(gameServerId !== null && { gameServerId }),
      itemCode: product.itemCode,
      itemName: product.itemName,
      amount: finalAmount,
    }),
  );

  let invoice;
  try {
    invoice = await conversation.external(() =>
      createInvoice({
        merchantOrderId: order.paymentRef!,
        amount: finalAmount,
        itemName: product.itemName,
        customerName: telegramUser.first_name,
        customerEmail: `tg${telegramUser.id}@yokmabar.app`,
        paymentMethod,
      }),
    );
  } catch {
    await ctx.reply(
      "😅 Ups, ada gangguan sebentar.\nCoba lagi dalam beberapa menit ya!",
    );
    return;
  }

  await conversation.external(() =>
    Promise.all([
      setPaymentUrl(order.id, invoice.paymentUrl),
      scheduleOrderExpiry(order.id),
    ]),
  );

  // ── Kirim tagihan ───────────────────────────────────────────────────────────
  await ctx.reply(
    `💳 <b>Tagihan YokMabar</b>\n` +
      `Nominal  : ${formatRupiah(finalAmount)}\n` +
      `Order    : #${order.paymentRef}\n` +
      `Berlaku  : 15 menit ⏰\n\n` +
      `Selesaikan pembayaran sebelum waktu habis ya!\n` +
      `${invoice.paymentUrl}`,
    { parse_mode: "HTML" },
  );
}
