import { Queue } from "bullmq";
import { config } from "../config.js";

// ─── Connection Options ───────────────────────────────────────────────────────
//
// BullMQ v5 bundles ioredis sendiri — jangan share IORedis instance dari
// top-level ioredis karena TypeScript strict akan melempar type error.
// Solusi: pakai plain connection options, BullMQ buat instance internalnya sendiri.

const redisUrl = new URL(config.REDIS_URL);

export const connectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
  // maxRetriesPerRequest: null diset di worker masing-masing
} as const;

// ─── Job Data Types ───────────────────────────────────────────────────────────

export interface OrderJobData {
  orderId: string;
}

export interface ExpireJobData {
  orderId: string;
}

export interface SyncJobData {
  type: "full" | "partial" | "ondemand";
  brands?: string[]; // hanya untuk partial sync
}

export interface BalanceJobData {
  triggeredBy: "scheduler" | "manual";
}

// ─── Queue Names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  ORDER: "order",
  EXPIRE: "expire",
  SYNC: "sync",
  BALANCE: "balance",
} as const;

// ─── Job Name Types ───────────────────────────────────────────────────────────

export type OrderJobName = "process-order";
export type ExpireJobName = "expire-order";
export type SyncJobName = "full-sync" | "partial-sync" | "ondemand-sync";
export type BalanceJobName = "check-balance";

// ─── Queues ───────────────────────────────────────────────────────────────────

/**
 * Order queue — proses top up ke Digiflazz setelah order PAID.
 * Retry 3x dengan exponential backoff.
 */
export const orderQueue = new Queue<OrderJobData, void, OrderJobName>(
  QUEUE_NAMES.ORDER,
  {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  },
);

/**
 * Expire queue — expire order PENDING setelah 15 menit.
 * Satu delayed job per order, tidak perlu retry.
 */
export const expireQueue = new Queue<ExpireJobData, void, ExpireJobName>(
  QUEUE_NAMES.EXPIRE,
  {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  },
);

/**
 * Sync queue — sinkronisasi harga produk dari Digiflazz ke DB.
 * 3 jenis job: full (jam 03.00), partial (tiap 6 jam), ondemand (admin).
 */
export const syncQueue = new Queue<SyncJobData, void, SyncJobName>(
  QUEUE_NAMES.SYNC,
  {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "fixed", delay: 30_000 },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  },
);

/**
 * Balance queue — cek saldo Digiflazz tiap 1 jam, notif admin jika menipis.
 */
export const balanceQueue = new Queue<BalanceJobData, void, BalanceJobName>(
  QUEUE_NAMES.BALANCE,
  {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "fixed", delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  },
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tambah delayed job untuk expire order setelah 15 menit.
 * Dipanggil saat order dibuat.
 */
export async function scheduleOrderExpiry(orderId: string): Promise<void> {
  await expireQueue.add(
    "expire-order",
    { orderId },
    { delay: 15 * 60 * 1000, jobId: `expire:${orderId}` },
  );
}

/**
 * Batalkan expire job jika order sudah dibayar sebelum 15 menit.
 * Dipanggil saat webhook Duitku masuk.
 */
export async function cancelOrderExpiry(orderId: string): Promise<void> {
  const job = await expireQueue.getJob(`expire:${orderId}`);
  if (job !== undefined) {
    await job.remove();
  }
}

/**
 * Tambah job proses top-up setelah order PAID.
 */
export async function enqueueOrderProcessing(orderId: string): Promise<void> {
  await orderQueue.add(
    "process-order",
    { orderId },
    { jobId: `order:${orderId}` },
  );
}

/**
 * Tutup semua queue — graceful shutdown.
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    orderQueue.close(),
    expireQueue.close(),
    syncQueue.close(),
    balanceQueue.close(),
  ]);
}
