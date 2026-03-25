import { type Order, type OrderStatus, Prisma } from "@prisma/client";
import { db } from "../db/client.js";
import { config } from "../config.js";

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class OrderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "INVALID_TRANSITION"
      | "ALREADY_PROCESSED"
      | "EXPIRED",
  ) {
    super(message);
    this.name = "OrderError";
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  userId: string;
  game: string;
  gameUserId: string;
  gameServerId?: string;
  itemCode: string;
  itemName: string;
  amount: number;
}

// ─── State Machine ────────────────────────────────────────────────────────────
//
//  PENDING → PAID → PROCESSING → SUCCESS
//                             ↘ FAILED
//  PENDING → EXPIRED

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "EXPIRED"],
  PAID: ["PROCESSING"],
  PROCESSING: ["SUCCESS", "FAILED"],
  SUCCESS: [],
  FAILED: [],
  EXPIRED: [],
};

function assertTransition(current: OrderStatus, next: OrderStatus): void {
  if (!VALID_TRANSITIONS[current].includes(next)) {
    throw new OrderError(
      `Transisi status tidak valid: ${current} → ${next}`,
      "INVALID_TRANSITION",
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOrderRef(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `YM-${suffix}`;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 menit

  return db.order.create({
    data: {
      userId: input.userId,
      game: input.game,
      gameUserId: input.gameUserId,
      gameServerId: input.gameServerId ?? null,
      itemCode: input.itemCode,
      itemName: input.itemName,
      amount: input.amount,
      status: "PENDING",
      paymentRef: generateOrderRef(),
      expiredAt,
    },
  });
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getOrderById(id: string): Promise<Order | null> {
  return db.order.findUnique({ where: { id } });
}

export async function getOrderByPaymentRef(
  paymentRef: string,
): Promise<Order | null> {
  return db.order.findUnique({ where: { paymentRef } });
}

export async function getOrderBySupplierRef(
  supplierRef: string,
): Promise<Order | null> {
  return db.order.findUnique({ where: { supplierRef } });
}

// ─── State Transitions ────────────────────────────────────────────────────────

/**
 * PENDING → PAID
 * Dipanggil oleh webhook Duitku saat status "00".
 */
export async function markAsPaid(
  orderId: string,
  paymentMethod: string,
): Promise<Order> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (order === null) {
    throw new OrderError(`Order ${orderId} tidak ditemukan`, "NOT_FOUND");
  }

  assertTransition(order.status, "PAID");

  return db.order.update({
    where: { id: orderId },
    data: { status: "PAID", paymentMethod },
  });
}

/**
 * PAID → PROCESSING
 * Dipanggil oleh order worker setelah request dikirim ke Digiflazz.
 */
export async function markAsProcessing(
  orderId: string,
  supplierRef: string,
): Promise<Order> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (order === null) {
    throw new OrderError(`Order ${orderId} tidak ditemukan`, "NOT_FOUND");
  }

  assertTransition(order.status, "PROCESSING");

  return db.order.update({
    where: { id: orderId },
    data: { status: "PROCESSING", supplierRef },
  });
}

/**
 * PROCESSING → SUCCESS
 * Dipanggil oleh webhook Digiflazz saat status "Sukses".
 */
export async function markAsSuccess(orderId: string): Promise<Order> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (order === null) {
    throw new OrderError(`Order ${orderId} tidak ditemukan`, "NOT_FOUND");
  }

  assertTransition(order.status, "SUCCESS");

  return db.order.update({
    where: { id: orderId },
    data: { status: "SUCCESS" },
  });
}

/**
 * PROCESSING → FAILED
 * Dipanggil oleh webhook Digiflazz saat "Gagal" atau timeout.
 * adminNote berisi pesan error dari Digiflazz.
 */
export async function markAsFailed(
  orderId: string,
  adminNote: string,
): Promise<Order> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (order === null) {
    throw new OrderError(`Order ${orderId} tidak ditemukan`, "NOT_FOUND");
  }

  assertTransition(order.status, "FAILED");

  return db.order.update({
    where: { id: orderId },
    data: { status: "FAILED", adminNote },
  });
}

/**
 * PENDING → EXPIRED
 * Dipanggil oleh BullMQ expire worker setelah 15 menit.
 * Jika order sudah PAID/PROCESSING/SUCCESS/FAILED, lewati tanpa error.
 */
export async function markAsExpired(orderId: string): Promise<Order | null> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (order === null) return null;

  // Jika sudah bukan PENDING, berarti sudah dibayar — jangan expire
  if (order.status !== "PENDING") return order;

  return db.order.update({
    where: { id: orderId },
    data: { status: "EXPIRED" },
  });
}

// ─── Set Payment URL ──────────────────────────────────────────────────────────

/**
 * Simpan URL pembayaran Duitku ke order.
 * Dipanggil setelah invoice Duitku berhasil dibuat.
 */
export async function setPaymentUrl(
  orderId: string,
  paymentUrl: string,
): Promise<Order> {
  return db.order.update({
    where: { id: orderId },
    data: { paymentUrl },
  });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * Ambil semua order dengan status tertentu.
 * Dipakai admin untuk monitoring.
 */
export async function getOrdersByStatus(status: OrderStatus): Promise<Order[]> {
  return db.order.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Ambil order yang PROCESSING lebih dari N menit (untuk timeout check).
 */
export async function getStuckProcessingOrders(
  olderThanMinutes: number,
): Promise<Order[]> {
  const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return db.order.findMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: threshold },
    },
    orderBy: { updatedAt: "asc" },
  });
}
