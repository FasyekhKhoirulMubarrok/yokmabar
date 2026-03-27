import { PointType } from "@prisma/client";
import { db } from "../db/client.js";
import { redis } from "../db/redis.js";
import { config } from "../config.js";

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class PointError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INSUFFICIENT_BALANCE"
      | "INVALID_AMOUNT"
      | "ORDER_ALREADY_HAS_POINTS",
  ) {
    super(message);
    this.name = "PointError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newExpiry(): Date {
  return new Date(
    Date.now() + config.POINT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );
}

// ─── Earn Points ──────────────────────────────────────────────────────────────

/**
 * Tambah poin setelah order SUCCESS.
 * Formula: Math.floor(amount / POINT_RATE)
 *
 * Dalam satu transaksi atomik:
 * 1. Buat Point baru { type: EARNED }
 * 2. Refresh expiredAt semua poin EARNED aktif user → now() + 90 hari
 *
 * Poin tidak ditambah jika order sudah pernah mendapat poin.
 */
export async function earnPoints(
  userId: string,
  orderId: string,
  amount: number,
): Promise<number> {
  const points = Math.floor(amount / config.POINT_RATE);

  // Tidak ada poin untuk transaksi kecil
  if (points === 0) return 0;

  const expiredAt = newExpiry();

  await db.$transaction(async (tx) => {
    // Guard: cegah double earn untuk order yang sama
    const existing = await tx.point.findUnique({ where: { orderId } });
    if (existing !== null) {
      throw new PointError(
        `Order ${orderId} sudah mendapat poin`,
        "ORDER_ALREADY_HAS_POINTS",
      );
    }

    // 1. Buat poin baru
    await tx.point.create({
      data: {
        userId,
        orderId,
        type: PointType.EARNED,
        amount: points,
        description: `Top up reward`,
        expiredAt,
      },
    });

    // 2. Refresh expiredAt semua poin EARNED aktif milik user
    await tx.point.updateMany({
      where: {
        userId,
        type: PointType.EARNED,
        expiredAt: { gt: new Date() },
      },
      data: { expiredAt },
    });
  });

  return points;
}

// ─── Get Active Points ────────────────────────────────────────────────────────

/**
 * Hitung total poin aktif user.
 * SUM(amount) dari poin EARNED yang belum expired.
 * REDEEMED sudah disimpan dengan amount negatif sehingga tidak dijumlah di sini.
 */
export async function getActivePoints(userId: string): Promise<number> {
  const result = await db.point.aggregate({
    where: {
      userId,
      type: PointType.EARNED,
      expiredAt: { gt: new Date() },
    },
    _sum: { amount: true },
  });

  return result._sum.amount ?? 0;
}

// ─── Redeem Points ────────────────────────────────────────────────────────────

/**
 * Tukar poin menjadi diskon.
 * Aturan:
 * - pointsToRedeem harus kelipatan POINT_REDEEM_UNIT (default 200)
 * - Saldo aktif harus >= pointsToRedeem
 * - Diskon = (pointsToRedeem / POINT_REDEEM_UNIT) * POINT_REDEEM_VALUE
 *
 * Return nilai diskon dalam Rupiah.
 */
export async function redeemPoints(
  userId: string,
  pointsToRedeem: number,
): Promise<number> {
  if (
    pointsToRedeem <= 0 ||
    pointsToRedeem % config.POINT_REDEEM_UNIT !== 0
  ) {
    throw new PointError(
      `Penukaran poin harus kelipatan ${config.POINT_REDEEM_UNIT}`,
      "INVALID_AMOUNT",
    );
  }

  // Redis lock — cegah double redeem dari request bersamaan
  const lockKey = `point:lock:${userId}`;
  const locked = await redis.set(lockKey, "1", "EX", 30, "NX");
  if (locked === null) {
    throw new PointError(
      "Penukaran poin sedang diproses, coba lagi sebentar",
      "INSUFFICIENT_BALANCE",
    );
  }

  try {
    const discount = await db.$transaction(async (tx) => {
      // Baca saldo di dalam transaksi agar atomic
      const result = await tx.point.aggregate({
        where: {
          userId,
          type: PointType.EARNED,
          expiredAt: { gt: new Date() },
        },
        _sum: { amount: true },
      });
      const activePoints = result._sum.amount ?? 0;

      if (activePoints < pointsToRedeem) {
        throw new PointError(
          `Poin tidak cukup. Aktif: ${activePoints}, dibutuhkan: ${pointsToRedeem}`,
          "INSUFFICIENT_BALANCE",
        );
      }

      const disc =
        (pointsToRedeem / config.POINT_REDEEM_UNIT) * config.POINT_REDEEM_VALUE;

      await tx.point.create({
        data: {
          userId,
          type: PointType.REDEEMED,
          amount: -pointsToRedeem,
          description: `Penukaran ${pointsToRedeem} poin → diskon Rp ${disc.toLocaleString("id-ID")}`,
          expiredAt: newExpiry(),
        },
      });

      return disc;
    });

    return discount;
  } finally {
    await redis.del(lockKey);
  }
}

// ─── Expire Points ────────────────────────────────────────────────────────────

/**
 * Tandai poin EARNED yang sudah lewat expiredAt menjadi EXPIRED.
 * Dijalankan oleh BullMQ job setiap hari jam 02.00 WIB.
 *
 * Return jumlah record yang di-expire.
 */
export async function expirePoints(): Promise<number> {
  const result = await db.point.updateMany({
    where: {
      type: PointType.EARNED,
      expiredAt: { lt: new Date() },
    },
    data: { type: PointType.EXPIRED },
  });

  return result.count;
}

// ─── Point Summary ────────────────────────────────────────────────────────────

export interface PointSummary {
  activePoints: number;
  canRedeem: boolean;
  maxRedeemablePoints: number;
  maxDiscount: number;
}

/**
 * Ringkasan poin user untuk ditampilkan di bot.
 * canRedeem = true jika saldo >= POINT_REDEEM_UNIT (default 200).
 */
export async function getPointSummary(userId: string): Promise<PointSummary> {
  const activePoints = await getActivePoints(userId);
  const maxRedeemablePoints =
    Math.floor(activePoints / config.POINT_REDEEM_UNIT) *
    config.POINT_REDEEM_UNIT;
  const maxDiscount =
    (maxRedeemablePoints / config.POINT_REDEEM_UNIT) *
    config.POINT_REDEEM_VALUE;

  return {
    activePoints,
    canRedeem: activePoints >= config.POINT_REDEEM_UNIT,
    maxRedeemablePoints,
    maxDiscount,
  };
}
