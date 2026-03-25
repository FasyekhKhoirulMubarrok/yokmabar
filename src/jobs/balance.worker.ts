import { Worker, type Job } from "bullmq";
import {
  connectionOptions,
  QUEUE_NAMES,
  balanceQueue,
  type BalanceJobData,
  type BalanceJobName,
} from "./queue.js";
import { getBalance } from "../services/balance.service.js";
import { notifyAdminLowBalance } from "../services/notification.service.js";

// ─── Processor ────────────────────────────────────────────────────────────────

async function processBalance(
  job: Job<BalanceJobData, void, BalanceJobName>,
): Promise<void> {
  // bypass cache — ambil saldo terbaru langsung dari Digiflazz
  const result = await getBalance(true);

  console.info(
    `[balance-worker] Saldo Digiflazz: Rp ${result.balance.toLocaleString("id-ID")} ` +
      `(minimum: Rp ${result.minimumThreshold.toLocaleString("id-ID")}) — ` +
      `triggered by: ${job.data.triggeredBy}`,
  );

  if (result.isBelowMinimum) {
    await notifyAdminLowBalance(result.balance);
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const balanceWorker = new Worker<BalanceJobData, void, BalanceJobName>(
  QUEUE_NAMES.BALANCE,
  processBalance,
  {
    connection: { ...connectionOptions, maxRetriesPerRequest: null },
    concurrency: 1,
  },
);

// ─── Events ───────────────────────────────────────────────────────────────────

balanceWorker.on("completed", (job) => {
  console.info(`[balance-worker] Job ${job.id} selesai.`);
});

balanceWorker.on("failed", (job, err) => {
  console.error(
    `[balance-worker] Job ${job?.id ?? "unknown"} gagal: ${err.message}`,
  );
});

balanceWorker.on("error", (err) => {
  console.error("[balance-worker] Worker error:", err);
});

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Daftarkan repeatable job cek saldo setiap 1 jam.
 * Dipanggil saat startup dari src/index.ts.
 */
export async function registerBalanceSchedule(): Promise<void> {
  const repeatable = await balanceQueue.getRepeatableJobs();
  for (const job of repeatable) {
    await balanceQueue.removeRepeatableByKey(job.key);
  }

  await balanceQueue.add(
    "check-balance",
    { triggeredBy: "scheduler" },
    { repeat: { every: 60 * 60 * 1000 }, jobId: "check-balance-hourly" },
  );

  console.info("[balance-worker] Jadwal cek saldo terdaftar: setiap 1 jam.");
}

// ─── Manual Trigger ───────────────────────────────────────────────────────────

/**
 * Trigger cek saldo on-demand dari admin command.
 */
export async function triggerManualBalanceCheck(): Promise<void> {
  await balanceQueue.add(
    "check-balance",
    { triggeredBy: "manual" },
    { jobId: `check-balance-manual:${Date.now()}` },
  );
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

export async function closeBalanceWorker(): Promise<void> {
  await balanceWorker.close();
}
