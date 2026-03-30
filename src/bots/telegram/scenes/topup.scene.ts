import { InlineKeyboard, type Context, type SessionFlavor } from "grammy";
import {
  type Conversation,
  type ConversationFlavor,
} from "@grammyjs/conversations";
import { InputFile } from "grammy";
import { db } from "../../../db/client.js";
import { formatNominalLabel, generateQrBuffer, getBrandEmoji, stripBrandPrefix } from "../../../utils/formatter.js";
import { getPopularBrands, getProductsByBrand, searchProducts } from "../../../services/product.service.js";
import { getPointSummary, redeemPoints } from "../../../services/point.service.js";
import { createOrder, setPaymentUrl, markAsPaid } from "../../../services/order.service.js";
import { checkGameId, getInquirySku } from "../../../services/supplier.service.js";
import { createInvoice } from "../../../services/payment.service.js";
import { scheduleOrderExpiry, enqueueOrderProcessing } from "../../../jobs/queue.js";
import { type Product, type PriceEvent } from "@prisma/client";
import { getActiveEvent, applyEventPricing, type EventPricing } from "../../../services/event.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BotContext = ConversationFlavor<Context & SessionFlavor<Record<string, never>>>;
export type TopUpConversation = Conversation<BotContext, Context>;

// ─── Constants ────────────────────────────────────────────────────────────────

// Game yang butuh Server ID
const GAMES_NEED_SERVER_ID = new Set([
  "mobile legends",
  "genshin impact",
  "honkai: star rail",
]);

function needsServerId(brand: string): boolean {
  return GAMES_NEED_SERVER_ID.has(brand.toLowerCase());
}


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
  event: PriceEvent | null,
): Promise<Product | null> {
  const products = await conversation.external(() => getProductsByBrand(brand));

  if (products.length === 0) {
    await ctx.reply(`😅 Produk ${brand} belum tersedia saat ini.`);
    return null;
  }

  const list = products.slice(0, 25);

  // Bangun teks list bernomor
  const lines = list.map((p, i) => {
    const num = String(i + 1).padStart(2, " ");
    if (event !== null && p.basePrice > 0) {
      const ep = applyEventPricing(p.basePrice, event);
      const clean = stripBrandPrefix(brand, p.itemName);
      return `${num}. ${getBrandEmoji(brand)} ${clean}\n    <s>${formatRupiah(ep.strikethroughPrice)}</s> → <b>${formatRupiah(ep.actualPrice)}</b> 🔥 -${ep.discountPercent}%`;
    }
    const label = formatNominalLabel(brand, p.itemName, p.price);
    return `${num}. ${label}`;
  });

  // Gunakan <code> hanya jika tidak ada event (agar tag HTML bekerja saat event)
  const listText = event !== null
    ? `${getBrandEmoji(brand)} <b>Pilih nominal ${brand}:</b>\n\n${lines.join("\n")}`
    : `${getBrandEmoji(brand)} <b>Pilih nominal ${brand}:</b>\n\n<code>${lines.join("\n")}</code>`;

  // Bangun tombol angka 5 per baris + tombol batal
  const keyboard = new InlineKeyboard();
  const numRows = chunkArray(list, 5);
  for (const row of numRows) {
    for (const [i, p] of row.entries()) {
      const globalIndex = list.indexOf(p) + 1;
      keyboard.text(String(globalIndex), `item:${p.itemCode}`);
    }
    keyboard.row();
  }
  keyboard.text("❌ Batal", "item:cancel");

  await ctx.reply(listText, { reply_markup: keyboard, parse_mode: "HTML" });

  const cb = await conversation.waitForCallbackQuery(/^item:.+$/, {
    otherwise: (c) => c.reply("😊 Tap nomor nominal yang kamu mau ya!"),
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
  const needsServer = needsServerId(brand);

  const isValorant = brand.toLowerCase() === "valorant";
  let idPrompt: string;
  if (isValorant) {
    idPrompt = `🆔 Masukkan <b>Username Valorant</b> kamu:\n<i>Format: username#tag (contoh: NamaKamu#1234)</i>`;
  } else if (needsServer) {
    idPrompt = `🆔 Masukkan <b>User ID</b> ${brand} kamu:\n<i>Contoh: 123456789</i>`;
  } else {
    idPrompt = `🆔 Masukkan <b>ID akun</b> ${brand} kamu:`;
  }

  await ctx.reply(idPrompt, { parse_mode: "HTML" });

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
  effectivePrice: number,
  eventPricing: EventPricing | null,
  inquiryUsername?: string | null,
): Promise<boolean> {
  const idLine = gameServerId
    ? `Game ID  : ${gameUserId} (Server: ${gameServerId})`
    : `Game ID  : ${gameUserId}`;

  const verifiedLine = inquiryUsername !== undefined && inquiryUsername !== null
    ? `\n✅ Username : ${inquiryUsername}`
    : "";

  const hargaLine = eventPricing !== null
    ? `Harga    : <s>${formatRupiah(eventPricing.strikethroughPrice)}</s> → <b>${formatRupiah(effectivePrice)}</b> 🔥 Diskon ${eventPricing.discountPercent}%`
    : `Harga    : ${formatRupiah(effectivePrice)}`;

  const text =
    `📋 <b>Konfirmasi Order</b>\n\n` +
    `Game     : ${product.brand}\n` +
    `Item     : ${stripBrandPrefix(product.brand, product.itemName)}\n` +
    `${hargaLine}\n` +
    `${idLine}${verifiedLine}\n\n` +
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

  const isFree = summary.maxDiscount >= productPrice;
  const keyboard = new InlineKeyboard();

  if (isFree) {
    keyboard
      .text("🎉 Ya, gratis pakai poin!", "points:use")
      .row()
      .text("➡️ Bayar normal", "points:skip");

    await ctx.reply(
      `🎉 <b>Selamat! Poin kamu cukup untuk item ini GRATIS!</b>\n\n` +
        `Saldo poin : ${summary.activePoints} poin\n` +
        `Harga item : ${formatRupiah(productPrice)}\n\n` +
        `Mau pakai poin untuk bayar penuh item ini?`,
      { reply_markup: keyboard, parse_mode: "HTML" },
    );
  } else {
    const afterDiscount = productPrice - summary.maxDiscount;
    keyboard
      .text(`💰 Pakai ${summary.maxRedeemablePoints} poin (hemat ${formatRupiah(summary.maxDiscount)})`, "points:use")
      .row()
      .text("➡️ Lewati", "points:skip");

    await ctx.reply(
      `🎁 Kamu punya <b>${summary.activePoints} poin</b>!\n` +
        `Mau pakai ${summary.maxRedeemablePoints} poin untuk hemat <b>${formatRupiah(summary.maxDiscount)}</b>?\n` +
        `Total setelah diskon: <b>${formatRupiah(afterDiscount)}</b>`,
      { reply_markup: keyboard, parse_mode: "HTML" },
    );
  }

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

  // Tampilkan saldo poin jika ada
  const pointSummary = await conversation.external(() => getPointSummary(userId));
  if (pointSummary.activePoints > 0) {
    await ctx.reply(
      `💰 Saldo poin kamu: <b>${pointSummary.activePoints} poin</b> (= hemat ${formatRupiah(pointSummary.maxDiscount)})`,
      { parse_mode: "HTML" },
    );
  }

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

  // ── Cek event aktif untuk brand ini ────────────────────────────────────────
  const activeEvent = await conversation.external(() => getActiveEvent(brand!));

  // ── Step 3: Pilih nominal ───────────────────────────────────────────────────
  const product = await stepSelectNominal(conversation, ctx, brand, activeEvent);
  if (product === null) {
    await ctx.reply("😊 Order dibatalkan. Ketik /topup untuk mulai lagi!");
    return;
  }

  // Re-cek event dengan itemCode — agar scope ITEMS juga ter-cover
  const productEvent = await conversation.external(() =>
    getActiveEvent(brand!, product.itemCode),
  );
  const eventPricing = productEvent !== null && product.basePrice > 0
    ? applyEventPricing(product.basePrice, productEvent)
    : null;
  const effectivePrice = eventPricing !== null ? eventPricing.actualPrice : product.price;

  // ── Step 4: Input User ID (+ Server ID jika perlu) ─────────────────────────
  const { gameUserId, gameServerId } = await stepInputUserId(conversation, ctx, brand);

  // ── Cek ID game (Free Fire & Mobile Legends) ────────────────────────────────
  const inquiryResult = await conversation.external(() =>
    checkGameId(brand!, gameUserId, gameServerId),
  );

  if (inquiryResult !== null) {
    await ctx.reply(
      `✅ <b>ID ditemukan!</b> Username: <b>${inquiryResult.username}</b>`,
      { parse_mode: "HTML" },
    );
  } else if (getInquirySku(brand!) !== null) {
    await ctx.reply(
      `⚠️ <b>ID tidak ditemukan.</b> Cek kembali ID kamu ya.\nKamu masih bisa lanjut jika yakin sudah benar.`,
      { parse_mode: "HTML" },
    );
  }

  // ── Step 5: Konfirmasi ──────────────────────────────────────────────────────
  const confirmed = await stepConfirm(
    conversation, ctx, product, gameUserId, gameServerId,
    effectivePrice, eventPricing, inquiryResult?.username,
  );
  if (!confirmed) {
    await ctx.reply("😊 Order dibatalkan. Ketik /topup untuk mulai lagi!");
    return;
  }

  // ── Step 6: Tawaran poin ────────────────────────────────────────────────────
  const pointDiscount = await stepOfferPoints(conversation, ctx, userId, effectivePrice);
  const finalAmount = Math.max(effectivePrice - pointDiscount, 0);

  // ── Step 7: Buat order + invoice (QRIS) ─────────────────────────────────────
  await ctx.reply("⏳ Memproses order...");

  let order;
  try {
    order = await conversation.external(() =>
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
  } catch (err) {
    console.error("[telegram] createOrder error:", err);
    await ctx.reply("😅 Ups, ada gangguan sebentar.\nCoba lagi dalam beberapa menit ya!");
    return;
  }

  // ── Jika poin menutupi full harga, bypass Duitku ────────────────────────────
  if (finalAmount === 0) {
    await conversation.external(() =>
      Promise.all([
        markAsPaid(order.id, "POINTS"),
        enqueueOrderProcessing(order.id),
      ]),
    );
    await ctx.reply(
      `✅ <b>Order diproses!</b>\n` +
      `Order    : #${order.paymentRef}\n` +
      `Item     : ${stripBrandPrefix(product.brand, product.itemName)}\n\n` +
      `Pembayaran menggunakan poin. Top up sedang diproses! 🚀`,
      { parse_mode: "HTML" },
    );
    return;
  }

  let invoice;
  try {
    invoice = await conversation.external(() =>
      createInvoice({
        merchantOrderId: order.paymentRef!,
        amount: finalAmount,
        itemName: product.itemName,
        customerName: telegramUser.first_name,
        customerEmail: `tg${telegramUser.id}@yokmabar.app`,
        paymentMethod: "QRIS",
      }),
    );
  } catch (err) {
    console.error("[telegram] createInvoice error:", err);
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

  // ── Kirim tagihan QRIS ──────────────────────────────────────────────────────
  const caption =
    `💳 <b>Tagihan YokMabar</b>\n` +
    `Nominal  : ${formatRupiah(finalAmount)}\n` +
    `Order    : #${order.paymentRef}\n` +
    `Berlaku  : 15 menit ⏰\n\n` +
    `Selesaikan pembayaran sebelum waktu habis ya!`;

  if (invoice.qrBuffer !== undefined) {
    await ctx.replyWithPhoto(new InputFile(invoice.qrBuffer, "qris.png"), {
      caption,
      parse_mode: "HTML",
    });
  } else {
    await ctx.reply(`${caption}\n${invoice.paymentUrl}`, { parse_mode: "HTML" });
  }
}
