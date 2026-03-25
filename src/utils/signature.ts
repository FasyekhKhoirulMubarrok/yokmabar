import { createHash, createHmac, timingSafeEqual } from "crypto";

// ─── MD5 ──────────────────────────────────────────────────────────────────────

export function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

// ─── HMAC MD5 ─────────────────────────────────────────────────────────────────

export function hmacMd5(key: string, data: string): string {
  return createHmac("md5", key).update(data).digest("hex");
}

// ─── Timing-safe comparison ───────────────────────────────────────────────────

/**
 * Bandingkan dua string signature dengan timing-safe untuk mencegah timing attack.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

// ─── Duitku ───────────────────────────────────────────────────────────────────

/**
 * Validasi signature Duitku webhook.
 * Signature = MD5(merchantCode + amount + merchantOrderId + apiKey)
 */
export function validateDuitkuSignature(
  merchantCode: string,
  amount: string,
  merchantOrderId: string,
  apiKey: string,
  receivedSignature: string,
): boolean {
  const expected = md5(`${merchantCode}${amount}${merchantOrderId}${apiKey}`);
  return safeCompare(expected, receivedSignature.toLowerCase());
}

// ─── Digiflazz ────────────────────────────────────────────────────────────────

/**
 * Validasi signature Digiflazz webhook.
 * Signature = MD5(username + apiKey + trxId)
 */
export function validateDigiflazzSignature(
  username: string,
  apiKey: string,
  trxId: string,
  receivedSignature: string,
): boolean {
  const expected = md5(`${username}${apiKey}${trxId}`);
  return safeCompare(expected, receivedSignature.toLowerCase());
}
