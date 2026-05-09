import { Worker, type Job } from "bullmq";
import { db } from "../db/client.js";
import { connectionOptions, QUEUE_NAMES, type OrderJobData, type OrderJobName } from "./queue.js";
import { topUp, SupplierError } from "../services/supplier.service.js";
import { markAsProcessing, markAsSuccess, markAsFailed } from "../services/order.service.js";
import { earnPoints } from "../services/point.service.js";
import { invalidateBalanceCache } from "../services/balance.service.js";
import {
  notifySuccess,
  notifyFailed,
  notifyAdminOrderFailed,
  notifyReferralBonus,
  notifyReviewRequest,
} from "../services/notification.service.js";
import { tryAwardReferralBonus } from "../services/referral.service.js";

// ─── Processor ────────────────────────────────────────────────────────────────

async function processOrder(job: Job<OrderJobData, void, OrderJobName>): Promise<void> {
  const { orderId } = job.data;

  // Ambil order + user dalam satu query
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });

  if (order === null) {
    // Order tidak ada — buang job tanpa retry
    throw new Error(`Order ${orderId} tidak ditemukan, skip.`);
  }

  // Guard: hanya proses order PAID atau PROCESSING (attempt ulang setelah network error)
  if (order.status !== "PAID" && order.status !== "PROCESSING") {
    return;
  }

  // PAID → PROCESSING; skip jika sudah PROCESSING dari attempt sebelumnya
  if (order.status === "PAID") {
    await markAsProcessing(orderId, orderId);
  }

  const maxAttempts = job.opts.attempts ?? 1;
  const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

  let topUpResult;
  try {
    const customerNo =
      order.gameServerId !== null && order.gameServerId !== ""
        ? `${order.gameUserId}${order.gameServerId}`
        : order.gameUserId;

    topUpResult = await topUp({
      refId: orderId,
      buyerSkuCode: order.itemCode,
      customerNo,
    });
  } catch (err) {
    const isTransactionFailed =
      err instanceof SupplierError && err.code === "TRANSACTION_FAILED";

    // Mark FAILED + notif hanya jika: Digiflazz tolak transaksi (tidak ada gunanya retry)
    // atau sudah habis semua attempt (REQUEST_FAILED / network error)
    if (isTransactionFailed || isLastAttempt) {
      const adminNote =
        err instanceof SupplierError ? err.message : "Unknown supplier error";

      const failed = await markAsFailed(orderId, adminNote);

      await Promise.allSettled([
        notifyFailed(failed, order.user.platform, order.user.platformUserId),
        notifyAdminOrderFailed(failed, order.user.platform, order.user.username),
      ]);

      if (isTransactionFailed) return;
    }

    // REQUEST_FAILED + masih ada sisa attempt → re-throw, order tetap PROCESSING
    throw err;
  }

  // Status "Pending" → Digiflazz masih proses, tunggu webhook
  if (topUpResult.status === "Pending") {
    return;
  }

  // Status "Sukses" → selesaikan langsung tanpa tunggu webhook
  if (topUpResult.status === "Sukses") {
    const success = await markAsSuccess(orderId);

    const [pointsResult] = await Promise.allSettled([
      earnPoints(order.userId, orderId, order.amount),
      invalidateBalanceCache(),
    ]);

    const pointsEarned =
      pointsResult.status === "fulfilled" ? pointsResult.value : 0;

    // Ambil total poin terbaru untuk ditampilkan di notif
    const { getActivePoints } = await import("../services/point.service.js");
    const totalPoints = await getActivePoints(order.userId);

    await notifySuccess(
      success,
      order.user.platform,
      order.user.platformUserId,
      pointsEarned,
      totalPoints,
      topUpResult.sn,
    );

    notifyReviewRequest(order.id, order.user.platform, order.user.platformUserId).catch(() => null);

    // Beri bonus poin ke inviter jika order dari server Discord referral
    const referralResult = await tryAwardReferralBonus(
      orderId,
      order.userId,
      order.discordGuildId,
    ).catch(() => null);

    if (referralResult !== null) {
      await notifyReferralBonus(
        referralResult.inviterDiscordId,
        referralResult.bonusPoints,
      ).catch(() => null);
    }
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const orderWorker = new Worker<OrderJobData, void, OrderJobName>(
  QUEUE_NAMES.ORDER,
  processOrder,
  {
    connection: { ...connectionOptions, maxRetriesPerRequest: null },
    concurrency: 5,
  },
);

// ─── Events ───────────────────────────────────────────────────────────────────

orderWorker.on("completed", (job) => {
  console.info(`[order-worker] Job ${job.id} selesai — order ${job.data.orderId}`);
});

orderWorker.on("failed", (job, err) => {
  console.error(
    `[order-worker] Job ${job?.id ?? "unknown"} gagal — order ${job?.data.orderId ?? "-"}: ${err.message}`,
  );
});

orderWorker.on("error", (err) => {
  console.error("[order-worker] Worker error:", err);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

export async function closeOrderWorker(): Promise<void> {
  await orderWorker.close();
}
