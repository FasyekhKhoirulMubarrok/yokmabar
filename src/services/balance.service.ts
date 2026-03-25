import { createHash } from "crypto";
import { config } from "../config.js";
import { redis } from "../db/redis.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const DIGIFLAZZ_BASE_URL = "https://api.digiflazz.com/v1";
const CACHE_KEY = "digiflazz:balance";
const CACHE_TTL = 60 * 5; // 5 menit — cukup fresh tanpa spam API

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BalanceResult {
  balance: number;
  isBelowMinimum: boolean;
  minimumThreshold: number;
}

// ─── Signature ────────────────────────────────────────────────────────────────

/**
 * Signature untuk cek saldo Digiflazz:
 * MD5(username + apiKey + "depo")
 *
 * String literal "depo" — bukan ref_id seperti transaksi.
 */
function createBalanceSign(): string {
  const raw = `${config.DIGIFLAZZ_USERNAME}${config.DIGIFLAZZ_API_KEY}depo`;
  return createHash("md5").update(raw).digest("hex");
}

// ─── Check Balance ────────────────────────────────────────────────────────────

/**
 * Ambil saldo deposit Digiflazz.
 * Redis cache TTL 5 menit — miss → hit Digiflazz API → simpan ke cache.
 *
 * Dipakai oleh:
 * - balance.worker.ts  → cek tiap 1 jam, notif admin jika menipis
 * - admin command       → cek on-demand
 */
export async function getBalance(
  bypassCache = false,
): Promise<BalanceResult> {
  if (!bypassCache) {
    const cached = await redis.get(CACHE_KEY);
    if (cached !== null) {
      return JSON.parse(cached) as BalanceResult;
    }
  }

  const sign = createBalanceSign();

  const response = await fetch(`${DIGIFLAZZ_BASE_URL}/cek-saldo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cmd: "deposit",
      username: config.DIGIFLAZZ_USERNAME,
      sign,
    }),
  });

  if (!response.ok) {
    throw new Error(`Digiflazz cek-saldo error: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { data?: { deposit?: number } };
  const balance = data.data?.deposit ?? 0;

  const result: BalanceResult = {
    balance,
    isBelowMinimum: balance < config.DIGIFLAZZ_MIN_BALANCE,
    minimumThreshold: config.DIGIFLAZZ_MIN_BALANCE,
  };

  await redis.set(CACHE_KEY, JSON.stringify(result), "EX", CACHE_TTL);

  return result;
}

/**
 * Invalidasi cache saldo — dipanggil setelah transaksi sukses
 * agar saldo berikutnya selalu fresh.
 */
export async function invalidateBalanceCache(): Promise<void> {
  await redis.del(CACHE_KEY);
}
