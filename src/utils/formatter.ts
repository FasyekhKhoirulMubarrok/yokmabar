// ─── Rupiah ───────────────────────────────────────────────────────────────────

/**
 * Format angka ke format Rupiah Indonesia.
 * Contoh: 19000 → "Rp 19.000"
 */
export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

// ─── Tanggal ──────────────────────────────────────────────────────────────────

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Format Date ke string tanggal WIB yang mudah dibaca.
 * Contoh: "23 Mar 2026 14:32 WIB"
 */
export function formatDateWIB(date: Date): string {
  return `${DATE_FORMAT.format(date)} WIB`;
}

// ─── Order Ref ────────────────────────────────────────────────────────────────

/**
 * Generate payment reference unik dengan prefix YM-.
 * Format: YM-{timestamp5char}{random5char} → total ~13 karakter
 */
export function generatePaymentRef(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 7);
  return `YM-${ts}${rand}`;
}

// ─── Brand Emoji ──────────────────────────────────────────────────────────────

const BRAND_EMOJI: Record<string, string> = {
  "mobile legends": "💎",
  "free fire": "💎",
  "pubg mobile": "🔫",
  "genshin impact": "💎",
  "valorant": "⚔️",
  "honkai: star rail": "💎",
  "telkomsel": "📱",
  "indosat": "📱",
  "tri": "📱",
  "axis": "📱",
  "xl": "📱",
  "smartfren": "📱",
  "by.u": "📱",
  "pln": "⚡",
  "dana": "💙",
  "ovo": "💜",
  "go pay": "💚",
  "shopee pay": "🧡",
  "pertamina gas": "⛽",
  "k-vision dan gol": "📺",
};

/**
 * Ambil emoji berdasarkan nama brand.
 * Default 🎮 jika brand tidak dikenali.
 */
export function getBrandEmoji(brand: string): string {
  return BRAND_EMOJI[brand.toLowerCase()] ?? "🎮";
}

/**
 * Format label nominal untuk tampilan di bot.
 * Contoh: "💎 86 Diamonds — Rp 19.000"
 */
export function formatNominalLabel(brand: string, itemName: string, price: number): string {
  return `${getBrandEmoji(brand)} ${itemName} — ${formatRupiah(price)}`;
}

// ─── Poin ─────────────────────────────────────────────────────────────────────

/**
 * Hitung poin yang diperoleh dari transaksi.
 * 1 poin per Rp 1.000 transaksi.
 */
export function calculateEarnedPoints(amount: number): number {
  return Math.floor(amount / 1_000);
}

/**
 * Hitung diskon Rupiah dari poin yang ditukar.
 * 200 poin = Rp 1.000 diskon.
 */
export function calculatePointDiscount(points: number): number {
  return Math.floor(points / 200) * 1_000;
}
