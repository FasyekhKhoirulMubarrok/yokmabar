import { Worker, type Job } from "bullmq";
import { db } from "../db/client.js";
import { connectionOptions, QUEUE_NAMES, type ExpireJobData, type ExpireJobName } from "./queue.js";
import { markAsExpired } from "../services/order.service.js";
import { notifyExpired } from "../services/notification.service.js";

// ─── Processor ────────────────────────────────────────────────────────────────

async function processExpire(job: Job<ExpireJobData, void, ExpireJobName>): Promise<void> {
  const { orderId } = job.data;

  // markAsExpired sudah guard: skip jika order bukan PENDING (idempotent)
  const order = await markAsExpired(orderId);

  if (order === null || order.status !== "EXPIRED") {
    // Order tidak ada atau sudah dibayar — tidak perlu notif
    return;
  }

  // Ambil user untuk tahu platform dan platformUserId
  const user = await db.user.findUnique({ where: { id: order.userId } });
  if (user === null) return;

  await notifyExpired(order, user.platform, user.platformUserId);
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const expireWorker = new Worker<ExpireJobData, void, ExpireJobName>(
  QUEUE_NAMES.EXPIRE,
  processExpire,
  {
    connection: { ...connectionOptions, maxRetriesPerRequest: null },
    concurrency: 10,
  },
);

// ─── Events ───────────────────────────────────────────────────────────────────

expireWorker.on("completed", (job) => {
  console.info(`[expire-worker] Job ${job.id} selesai — order ${job.data.orderId}`);
});

expireWorker.on("failed", (job, err) => {
  console.error(
    `[expire-worker] Job ${job?.id ?? "unknown"} gagal — order ${job?.data.orderId ?? "-"}: ${err.message}`,
  );
});

expireWorker.on("error", (err) => {
  console.error("[expire-worker] Worker error:", err);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

export async function closeExpireWorker(): Promise<void> {
  await expireWorker.close();
}
