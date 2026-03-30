import { redis } from "../../db/redis.js";
import { db } from "../../db/client.js";
import {
  getPopularBrands,
  getProductsByBrand,
  searchProducts,
} from "../../services/product.service.js";
import { getPointSummary, redeemPoints } from "../../services/point.service.js";
import { createOrder, setPaymentUrl } from "../../services/order.service.js";
import { createInvoice } from "../../services/payment.service.js";
import { scheduleOrderExpiry } from "../../jobs/queue.js";
import { getRecentOrders, formatOrderHistory } from "../../services/history.service.js";
import { createFeedback, addAdminReply, addUserReply, closeFeedback, getFeedbackWithUser, normalizeTicketId } from "../../services/feedback.service.js";
import { notifyAdminFeedback, notifyAdminFeedbackUserReply, notifyUserFeedbackReply, notifyUserFeedbackClosed } from "../../services/notification.service.js";
import { config } from "../../config.js";
import { stripBrandPrefix } from "../../utils/formatter.js";
import { checkGameId, getInquirySku } from "../../services/supplier.service.js";
import { type Product } from "@prisma/client";
import { getActiveEvent, applyEventPricing, eventAppliesToItem } from "../../services/event.service.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATE_TTL = 60 * 10; // 10 menit
const GAMES_NEED_SERVER_ID = new Set([
  "Mobile Legends",
  "Genshin Impact",
  "Honkai: Star Rail",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

type WaStep =
  | "main_menu"
  | "select_game"
  | "search_game"
  | "search_results"
  | "select_nominal"
  | "input_userid"
  | "input_serverid"
  | "confirm"
  | "offer_points"
  | "select_payment"
  | "feedback_input";

interface WaState {
  step: WaStep;
  brands?: string[];
  selectedBrand?: string;
  products?: Product[];
  selectedItemCode?: string;
  gameUserId?: string;
  gameServerId?: string | null;
  inquiryUsername?: string | null;
  userId?: string;
  pointDiscount?: number;
  effectivePrice?: number;      // harga setelah event pricing
  strikethroughPrice?: number;  // harga coret (untuk display)
  discountPercent?: number;     // persentase diskon
}

// ─── Redis State ──────────────────────────────────────────────────────────────

function stateKey(phone: string): string {
  return `wa:state:${phone}`;
}

async function getState(phone: string): Promise<WaState | null> {
  const raw = await redis.get(stateKey(phone));
  return raw !== null ? (JSON.parse(raw) as WaState) : null;
}

async function setState(phone: string, state: WaState): Promise<void> {
  await redis.set(stateKey(phone), JSON.stringify(state), "EX", STATE_TTL);
}

async function clearState(phone: string): Promise<void> {
  await redis.del(stateKey(phone));
}

// ─── Fonnte Sender ────────────────────────────────────────────────────────────

export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: config.FONNTE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ target: phone, message }),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

async function getOrCreateUser(phone: string): Promise<string> {
  const user = await db.user.upsert({
    where: { platform_platformUserId: { platform: "WHATSAPP", platformUserId: phone } },
    create: { platform: "WHATSAPP", platformUserId: phone },
    update: {},
  });
  return user.id;
}

function numberedList(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

function footer(hint: string): string {
  return `\n\n_${hint}_`;
}

// ─── Menu Builders ────────────────────────────────────────────────────────────

async function sendMainMenu(phone: string): Promise<void> {
  const text =
    `🎮 *YokMabar Bot*\n` +
    `Top up game cepat, langsung dari WhatsApp!\n\n` +
    numberedList(["Top Up Game", "Riwayat Transaksi", "Cek Poin", "Kirim Feedback"]) +
    footer("Balas dengan angka pilihanmu");
  await sendWhatsApp(phone, text);
  await setState(phone, { step: "main_menu" });
}

async function sendGameMenu(phone: string): Promise<void> {
  const brands = await getPopularBrands();
  const items = [...brands, "🔍 Cari game lain..."];
  const text =
    `🎮 *Pilih game yang mau di-top up:*\n\n` +
    numberedList(items) +
    footer("Balas dengan angka game pilihanmu");
  await sendWhatsApp(phone, text);
  await setState(phone, { step: "select_game", brands });
}

async function sendNominalMenu(phone: string, brand: string, products: Product[]): Promise<void> {
  const activeEvent = await getActiveEvent(brand, undefined, true);
  const list = products.slice(0, 15);

  const items = list.map((p) => {
    const clean = stripBrandPrefix(brand, p.itemName);
    if (activeEvent !== null && p.basePrice > 0 && eventAppliesToItem(activeEvent, p.itemCode)) {
      const ep = applyEventPricing(p.basePrice, activeEvent);
      return `${clean} — ~${formatRupiah(ep.strikethroughPrice)}~ → *${formatRupiah(ep.actualPrice)}* 🔥 -${ep.discountPercent}%`;
    }
    return `${clean} — ${formatRupiah(p.price)}`;
  });

  const text =
    `💎 *Pilih nominal ${brand}:*\n\n` +
    numberedList(items) +
    `\n0. ❌ Batal` +
    footer("Balas dengan angka nominal pilihanmu");
  await sendWhatsApp(phone, text);
  await setState(phone, { step: "select_nominal", selectedBrand: brand, products: list });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleWhatsAppMessage(
  phone: string,
  message: string,
): Promise<void> {
  const text = message.trim();
  const state = await getState(phone);

  // Reply tiket: "reply FB-XXXXX pesan" — berlaku untuk admin dan user
  const replyMatch = text.match(/^reply\s+(FB-\w+)\s+(.+)$/i);
  if (replyMatch !== null) {
    const ticketId = normalizeTicketId(replyMatch[1]!);
    const replyMessage = replyMatch[2]!.trim();
    if (phone === config.WHATSAPP_ADMIN_NUMBER) {
      await handleAdminWhatsAppReply(phone, ticketId, replyMessage);
    } else {
      await handleUserWhatsAppReply(phone, ticketId, replyMessage);
    }
    return;
  }

  // Tutup tiket: "tutup FB-XXXXX" — hanya admin
  const tutupMatch = text.match(/^tutup\s+(FB-\w+)$/i);
  if (tutupMatch !== null) {
    if (phone === config.WHATSAPP_ADMIN_NUMBER) {
      const ticketId = normalizeTicketId(tutupMatch[1]!);
      await handleWhatsAppCloseFeedback(phone, ticketId, true);
    }
    return;
  }

  // Kata kunci reset
  if (/^(batal|cancel|mulai|start|menu|halo|hai|hi|hello)$/i.test(text)) {
    await sendMainMenu(phone);
    return;
  }

  // State expired atau belum ada → tampil main menu
  if (state === null) {
    await sendMainMenu(phone);
    return;
  }

  switch (state.step) {
    case "main_menu":
      await handleMainMenu(phone, text, state);
      break;
    case "select_game":
      await handleSelectGame(phone, text, state);
      break;
    case "search_game":
      await handleSearchGame(phone, text);
      break;
    case "search_results":
      await handleSearchResults(phone, text, state);
      break;
    case "select_nominal":
      await handleSelectNominal(phone, text, state);
      break;
    case "input_userid":
      await handleInputUserId(phone, text, state);
      break;
    case "input_serverid":
      await handleInputServerId(phone, text, state);
      break;
    case "confirm":
      await handleConfirm(phone, text, state);
      break;
    case "offer_points":
      await handleOfferPoints(phone, text, state);
      break;
    case "select_payment":
      await handleSelectPayment(phone, text, state);
      break;
    case "feedback_input":
      await handleFeedbackInput(phone, text);
      break;
  }
}

// ─── Step Handlers ────────────────────────────────────────────────────────────

async function handleMainMenu(phone: string, text: string, state: WaState): Promise<void> {
  const choice = parseInt(text, 10);
  if (choice === 1) {
    await sendGameMenu(phone);
  } else if (choice === 4) {
    await sendWhatsApp(
      phone,
      `📝 *Kirim Feedback*\n\nKetik pesan kamu — kritik, saran, atau laporan masalah:` +
      footer("Balas dengan pesan feedback kamu"),
    );
    await setState(phone, { step: "feedback_input" });
  } else if (choice === 2) {
    const userId = await getOrCreateUser(phone);
    const orders = await getRecentOrders(userId);
    // Strip HTML tags untuk WhatsApp
    const history = formatOrderHistory(orders).replace(/<\/?[^>]+(>|$)/g, "");
    await sendWhatsApp(phone, history);
    await sendMainMenu(phone);
  } else if (choice === 3) {
    const userId = await getOrCreateUser(phone);
    const summary = await getPointSummary(userId);
    const redeemInfo = summary.canRedeem
      ? `Kamu bisa tukar ${summary.maxRedeemablePoints} poin untuk hemat ${formatRupiah(summary.maxDiscount)}!`
      : `Kumpulkan lagi untuk bisa menukar poin.`;
    await sendWhatsApp(
      phone,
      `🎁 *Poin Kamu*\n\nSaldo aktif: *${summary.activePoints} poin*\n${redeemInfo}`,
    );
    await sendMainMenu(phone);
  } else {
    await sendWhatsApp(phone, `😊 Pilih angka 1–4 ya!` + footer("Balas dengan angka pilihanmu"));
    await setState(phone, state);
  }
}

async function handleFeedbackInput(phone: string, text: string): Promise<void> {
  if (text.trim().length < 5) {
    await sendWhatsApp(phone, `😊 Pesan terlalu singkat. Ceritakan lebih detail ya!` + footer("Ketik pesan feedback kamu"));
    await setState(phone, { step: "feedback_input" });
    return;
  }

  try {
    const userId = await getOrCreateUser(phone);
    const feedback = await createFeedback(userId, text.trim());
    await notifyAdminFeedback(feedback.ticketId, "WHATSAPP", phone.replace(/\D/g, ""), text.trim());

    await sendWhatsApp(
      phone,
      `✅ *Feedback diterima!*\n\n` +
      `Tiket : *#${feedback.ticketId}*\n` +
      `Pesan : ${text.trim()}\n\n` +
      `Tim kami akan segera merespons. Terima kasih! 🙏`,
    );
  } catch {
    await sendWhatsApp(phone, `😅 Ups, ada gangguan sebentar. Coba lagi dalam beberapa menit ya!`);
  }

  await sendMainMenu(phone);
}

async function handleAdminWhatsAppReply(phone: string, ticketId: string, replyMessage: string): Promise<void> {
  try {
    const feedback = await getFeedbackWithUser(ticketId);
    if (feedback === null) { await sendWhatsApp(phone, `😅 Tiket #${ticketId} tidak ditemukan.`); return; }
    if (feedback.status === "CLOSED") { await sendWhatsApp(phone, `😊 Tiket #${ticketId} sudah ditutup.`); return; }

    await addAdminReply(ticketId, replyMessage);
    await notifyUserFeedbackReply(feedback.user.platform, feedback.user.platformUserId, ticketId, replyMessage);
    await sendWhatsApp(phone, `✅ Balasan untuk *#${ticketId}* berhasil dikirim ke ${feedback.user.platform}!`);
  } catch (err) {
    console.error("[whatsapp-admin] feedback reply error:", err);
    await sendWhatsApp(phone, `😅 Gagal mengirim balasan. Coba lagi ya!`);
  }
}

async function handleUserWhatsAppReply(phone: string, ticketId: string, replyMessage: string): Promise<void> {
  try {
    const feedback = await getFeedbackWithUser(ticketId);
    if (feedback === null) { await sendWhatsApp(phone, `😅 Tiket #${ticketId} tidak ditemukan.`); return; }
    if (feedback.status === "CLOSED") { await sendWhatsApp(phone, `😊 Tiket #${ticketId} sudah ditutup. Buka tiket baru dengan ketik *menu* lalu pilih Kirim Feedback.`); return; }

    await addUserReply(ticketId, replyMessage);
    await notifyAdminFeedbackUserReply(ticketId, "WHATSAPP", phone, replyMessage);
    await sendWhatsApp(phone, `✅ Balasan kamu untuk tiket *#${ticketId}* sudah dikirim ke admin!`);
  } catch (err) {
    console.error("[whatsapp-user] feedback reply error:", err);
    await sendWhatsApp(phone, `😅 Gagal mengirim balasan. Coba lagi ya!`);
  }
}

async function handleWhatsAppCloseFeedback(phone: string, ticketId: string, isAdmin: boolean): Promise<void> {
  try {
    const feedback = await getFeedbackWithUser(ticketId);
    if (feedback === null) { await sendWhatsApp(phone, `😅 Tiket #${ticketId} tidak ditemukan.`); return; }
    if (feedback.status === "CLOSED") { await sendWhatsApp(phone, `😊 Tiket #${ticketId} sudah ditutup sebelumnya.`); return; }

    await closeFeedback(ticketId);

    if (isAdmin) {
      await notifyUserFeedbackClosed(feedback.user.platform, feedback.user.platformUserId, ticketId);
      await sendWhatsApp(phone, `✅ Tiket *#${ticketId}* ditutup dan user sudah dinotifikasi.`);
    } else {
      await sendWhatsApp(phone, `✅ Tiket *#${ticketId}* berhasil ditutup. Terima kasih! 🙏`);
    }
  } catch (err) {
    console.error("[whatsapp] close feedback error:", err);
    await sendWhatsApp(phone, `😅 Gagal menutup tiket. Coba lagi ya!`);
  }
}

async function handleSelectGame(phone: string, text: string, state: WaState): Promise<void> {
  const brands = state.brands ?? [];
  const items = [...brands, "🔍 Cari game lain..."];
  const choice = parseInt(text, 10);

  if (choice < 1 || choice > items.length) {
    await sendWhatsApp(phone, `😊 Pilih angka 1–${items.length} ya!` + footer("Balas dengan angka game pilihanmu"));
    await setState(phone, state);
    return;
  }

  const selected = items[choice - 1]!;

  if (selected.startsWith("🔍")) {
    await sendWhatsApp(phone, `🔍 Ketik nama game yang kamu cari:` + footer("Contoh: Mobile Legends"));
    await setState(phone, { step: "search_game" });
    return;
  }

  const products = await getProductsByBrand(selected);
  if (products.length === 0) {
    await sendWhatsApp(phone, `😅 Produk ${selected} belum tersedia saat ini.`);
    await sendGameMenu(phone);
    return;
  }

  await sendNominalMenu(phone, selected, products);
}

async function handleSearchGame(phone: string, text: string): Promise<void> {
  const results = await searchProducts(text);
  if (results.length === 0) {
    await sendWhatsApp(phone, `😅 Game "${text}" tidak ditemukan. Coba kata kunci lain!` + footer("Ketik nama game lagi"));
    await setState(phone, { step: "search_game" });
    return;
  }

  const brands = [...new Set(results.map((p) => p.brand))].slice(0, 8);
  const text2 =
    `🎮 *Hasil pencarian "${text}":*\n\n` +
    numberedList(brands) +
    `\n0. 🔍 Cari lagi` +
    footer("Balas dengan angka game pilihanmu");
  await sendWhatsApp(phone, text2);
  await setState(phone, { step: "search_results", brands });
}

async function handleSearchResults(phone: string, text: string, state: WaState): Promise<void> {
  const brands = state.brands ?? [];
  if (text === "0") {
    await sendWhatsApp(phone, `🔍 Ketik nama game yang kamu cari:` + footer("Contoh: Free Fire"));
    await setState(phone, { step: "search_game" });
    return;
  }

  const choice = parseInt(text, 10);
  if (choice < 1 || choice > brands.length) {
    await sendWhatsApp(phone, `😊 Pilih angka 1–${brands.length} ya!` + footer("Balas dengan angka pilihanmu"));
    await setState(phone, state);
    return;
  }

  const selected = brands[choice - 1]!;
  const products = await getProductsByBrand(selected);
  await sendNominalMenu(phone, selected, products);
}

async function handleSelectNominal(phone: string, text: string, state: WaState): Promise<void> {
  if (text === "0") {
    await sendMainMenu(phone);
    return;
  }

  const products = state.products ?? [];
  const choice = parseInt(text, 10);

  if (choice < 1 || choice > products.length) {
    await sendWhatsApp(phone, `😊 Pilih angka 1–${products.length} atau 0 untuk batal ya!` + footer("Balas dengan angka pilihanmu"));
    await setState(phone, state);
    return;
  }

  const product = products[choice - 1]!;
  const needsServer = GAMES_NEED_SERVER_ID.has(product.brand);
  const isValorant = product.brand.toLowerCase() === "valorant";

  // Hitung effective price berdasarkan event aktif (termasuk scope ITEMS)
  const activeEvent = await getActiveEvent(product.brand, product.itemCode);
  const ep = activeEvent !== null && product.basePrice > 0
    ? applyEventPricing(product.basePrice, activeEvent)
    : null;
  const effectivePrice = ep !== null ? ep.actualPrice : product.price;

  const userIdPrompt = isValorant
    ? `🆔 Masukkan *Username Valorant* kamu:` + footer("Format: username#tag (contoh: NamaKamu#1234)")
    : `🆔 Masukkan *User ID* ${product.brand} kamu:` + footer("Contoh: 123456789");

  await sendWhatsApp(phone, userIdPrompt);

  await setState(phone, {
    step: "input_userid",
    selectedBrand: product.brand,
    selectedItemCode: product.itemCode,
    effectivePrice,
    ...(ep !== null && { strikethroughPrice: ep.strikethroughPrice, discountPercent: ep.discountPercent }),
    ...(state.products !== undefined && { products: state.products }),
  });
}

async function handleInputUserId(phone: string, text: string, state: WaState): Promise<void> {
  const brand = state.selectedBrand ?? "";
  const needsServer = GAMES_NEED_SERVER_ID.has(brand);

  if (needsServer) {
    await sendWhatsApp(
      phone,
      `🌐 Sekarang masukkan *Server ID* kamu:` + footer("Contoh: 1234 (4 digit setelah titik pada User ID)"),
    );
    await setState(phone, { ...state, step: "input_serverid", gameUserId: text });
    return;
  }

  // Cek ID game untuk brand yang support inquiry
  const inquiryResult = await checkGameId(brand, text, null);
  if (inquiryResult !== null && inquiryResult.found) {
    await sendWhatsApp(phone, `✅ ID ditemukan! Username: *${inquiryResult.username}*`);
  } else if (inquiryResult !== null && !inquiryResult.found) {
    // ID tidak ditemukan — paksa ulangi input
    await sendWhatsApp(
      phone,
      `❌ ID tidak ditemukan. Pastikan User ID kamu sudah benar ya!\n\nMasukkan *User ID* ${brand} kamu lagi:` +
        footer("Contoh: 123456789"),
    );
    await setState(phone, { ...state, step: "input_userid" });
    return;
  }

  const inquiryUsername = inquiryResult?.found ? inquiryResult.username : null;
  await showConfirmation(phone, { ...state, gameUserId: text, gameServerId: null, inquiryUsername });
}

async function handleInputServerId(phone: string, text: string, state: WaState): Promise<void> {
  const brand = state.selectedBrand ?? "";
  const gameUserId = state.gameUserId ?? "";

  // Cek ID game untuk brand yang support inquiry (ML: userId.serverId)
  const inquiryResult = await checkGameId(brand, gameUserId, text);
  if (inquiryResult !== null && inquiryResult.found) {
    await sendWhatsApp(phone, `✅ ID ditemukan! Username: *${inquiryResult.username}*`);
  } else if (inquiryResult !== null && !inquiryResult.found) {
    // ID tidak ditemukan — kembali ke step input User ID
    await sendWhatsApp(
      phone,
      `❌ ID tidak ditemukan. Pastikan User ID dan Server ID kamu sudah benar ya!\n\nMasukkan ulang *User ID* ${brand} kamu:` +
        footer("Contoh: 123456789"),
    );
    const { gameUserId: _removed, ...stateWithoutUserId } = state;
    await setState(phone, { ...stateWithoutUserId, step: "input_userid" });
    return;
  }

  const inquiryUsername = inquiryResult?.found ? inquiryResult.username : null;
  await showConfirmation(phone, { ...state, gameServerId: text, inquiryUsername });
}

async function showConfirmation(phone: string, state: WaState): Promise<void> {
  const products = state.products ?? [];
  const product = products.find((p) => p.itemCode === state.selectedItemCode);
  if (product === undefined) {
    await sendMainMenu(phone);
    return;
  }

  const idLine = state.gameServerId
    ? `Game ID  : ${state.gameUserId} (Server: ${state.gameServerId})`
    : `Game ID  : ${state.gameUserId}`;

  const verifiedLine = state.inquiryUsername != null
    ? `\n✅ Username : ${state.inquiryUsername}`
    : "";

  const displayPrice = state.effectivePrice ?? product.price;
  const hargaLine = state.strikethroughPrice !== undefined
    ? `Harga    : ~${formatRupiah(state.strikethroughPrice)}~ → *${formatRupiah(displayPrice)}* 🔥 -${state.discountPercent ?? 0}%`
    : `Harga    : ${formatRupiah(displayPrice)}`;

  const text =
    `📋 *Konfirmasi Order*\n\n` +
    `Game     : ${product.brand}\n` +
    `Item     : ${stripBrandPrefix(product.brand, product.itemName)}\n` +
    `${hargaLine}\n` +
    `${idLine}${verifiedLine}\n\n` +
    `1. ✅ Konfirmasi\n2. ❌ Batal` +
    footer("Balas 1 untuk konfirmasi atau 2 untuk batal");

  await sendWhatsApp(phone, text);
  await setState(phone, { ...state, step: "confirm" });
}

async function handleConfirm(phone: string, text: string, state: WaState): Promise<void> {
  if (text === "2") {
    await sendWhatsApp(phone, `😊 Order dibatalkan. Balas *menu* untuk mulai lagi!`);
    await clearState(phone);
    return;
  }

  if (text !== "1") {
    await sendWhatsApp(phone, `😊 Balas *1* untuk konfirmasi atau *2* untuk batal ya!`);
    await setState(phone, state);
    return;
  }

  // Cek poin
  const userId = await getOrCreateUser(phone);
  const summary = await getPointSummary(userId);

  if (summary.canRedeem) {
    const text2 =
      `🎁 Kamu punya *${summary.activePoints} poin*!\n` +
      `Mau pakai ${summary.maxRedeemablePoints} poin untuk hemat *${formatRupiah(summary.maxDiscount)}*?\n\n` +
      `1. 💰 Pakai poin\n2. ➡️ Lewati` +
      footer("Balas 1 atau 2");
    await sendWhatsApp(phone, text2);
    await setState(phone, { ...state, step: "offer_points", userId });
    return;
  }

  await sendPaymentMenu(phone, { ...state, userId, pointDiscount: 0 });
}

async function handleOfferPoints(phone: string, text: string, state: WaState): Promise<void> {
  const userId = state.userId ?? (await getOrCreateUser(phone));

  if (text === "1") {
    const summary = await getPointSummary(userId);
    const discount = await redeemPoints(userId, summary.maxRedeemablePoints);
    await sendPaymentMenu(phone, { ...state, userId, pointDiscount: discount });
    return;
  }

  if (text === "2") {
    await sendPaymentMenu(phone, { ...state, userId, pointDiscount: 0 });
    return;
  }

  await sendWhatsApp(phone, `😊 Balas *1* untuk pakai poin atau *2* untuk lewati ya!`);
  await setState(phone, state);
}

async function sendPaymentMenu(phone: string, state: WaState): Promise<void> {
  const products = state.products ?? [];
  const product = products.find((p) => p.itemCode === state.selectedItemCode);
  if (product === undefined) { await sendMainMenu(phone); return; }

  const discount = state.pointDiscount ?? 0;
  const basePrice = state.effectivePrice ?? product.price;
  const finalAmount = Math.max(basePrice - discount, 0);

  const text =
    `💳 *Pembayaran QRIS*\n` +
    `Total: *${formatRupiah(finalAmount)}*\n\n` +
    `1. ✅ Lanjut bayar\n0. ❌ Batal` +
    footer("Balas 1 untuk lanjut atau 0 untuk batal");

  await sendWhatsApp(phone, text);
  await setState(phone, {
    ...state,
    step: "select_payment",
    pointDiscount: discount,
    ...(state.userId !== undefined && { userId: state.userId }),
  });
}

async function handleSelectPayment(phone: string, text: string, state: WaState): Promise<void> {
  if (text === "0") {
    await sendMainMenu(phone);
    return;
  }

  if (text !== "1") {
    await sendWhatsApp(phone, `😊 Balas 1 untuk lanjut atau 0 untuk batal ya!` + footer("Balas dengan angka"));
    await setState(phone, state);
    return;
  }

  const paymentMethod = "QRIS" as const;

  const products = state.products ?? [];
  const product = products.find((p) => p.itemCode === state.selectedItemCode);
  if (product === undefined) { await sendMainMenu(phone); return; }

  const userId = state.userId ?? (await getOrCreateUser(phone));
  const finalAmount = Math.max((state.effectivePrice ?? product.price) - (state.pointDiscount ?? 0), 0);

  await sendWhatsApp(phone, `⏳ Membuat tagihan, sebentar ya...`);

  try {
    const order = await createOrder({
      userId,
      game: product.brand,
      gameUserId: state.gameUserId ?? "",
      ...(state.gameServerId != null && state.gameServerId !== "" && { gameServerId: state.gameServerId }),
      itemCode: product.itemCode,
      itemName: product.itemName,
      amount: finalAmount,
    });

    const invoice = await createInvoice({
      merchantOrderId: order.paymentRef!,
      amount: finalAmount,
      itemName: product.itemName,
      customerName: `WA ${phone}`,
      customerEmail: `wa${phone}@yokmabar.app`,
      paymentMethod,
    });

    await Promise.all([
      setPaymentUrl(order.id, invoice.paymentUrl),
      scheduleOrderExpiry(order.id),
    ]);

    const tagihanText =
      `💳 *Tagihan YokMabar*\n` +
      `Nominal  : ${formatRupiah(finalAmount)}\n` +
      `Order    : #${order.paymentRef}\n` +
      `Berlaku  : 15 menit ⏰\n\n` +
      `Selesaikan pembayaran sebelum waktu habis ya!\n` +
      `${invoice.paymentUrl}`;

    await sendWhatsApp(phone, tagihanText);
    await clearState(phone);
  } catch {
    await sendWhatsApp(phone, `😅 Ups, ada gangguan sebentar. Coba lagi dalam beberapa menit ya!`);
    await sendMainMenu(phone);
  }
}
