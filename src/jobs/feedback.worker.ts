import { Worker, Queue, type Job } from "bullmq";
import { connectionOptions } from "./queue.js";
import { getInactiveFeedbacks, closeFeedback } from "../services/feedback.service.js";
import { notifyUserFeedbackClosed } from "../services/notification.service.js";

// ─── Queue ────────────────────────────────────────────────────────────────────

const FEEDBACK_QUEUE_NAME = "feedback";

export const feedbackQueue = new Queue(FEEDBACK_QUEUE_NAME, {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: 50,
  },
});

// ─── Processor ────────────────────────────────────────────────────────────────

async function processAutoClose(_job: Job): Promise<void> {
  const inactiveFeedbacks = await getInactiveFeedbacks(24);

  for (const feedback of inactiveFeedbacks) {
    try {
      await closeFeedback(feedback.ticketId);
      await notifyUserFeedbackClosed(
        feedback.user.platform,
        feedback.user.platformUserId,
        feedback.ticketId,
      );
      console.info(`[feedback-worker] Tiket #${feedback.ticketId} ditutup otomatis (tidak aktif 24 jam)`);
    } catch (err) {
      console.error(`[feedback-worker] Gagal tutup tiket #${feedback.ticketId}:`, err);
    }
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const feedbackWorker = new Worker(
  FEEDBACK_QUEUE_NAME,
  processAutoClose,
  {
    connection: { ...connectionOptions, maxRetriesPerRequest: null },
    concurrency: 1,
  },
);

// ─── Schedule: setiap jam ─────────────────────────────────────────────────────

export async function registerFeedbackSchedule(): Promise<void> {
  await feedbackQueue.add(
    "auto-close-feedback",
    {},
    {
      repeat: { pattern: "0 * * * *" }, // setiap jam
      jobId: "auto-close-feedback",
    },
  );
}

// ─── Events ───────────────────────────────────────────────────────────────────

feedbackWorker.on("completed", (job) => {
  console.info(`[feedback-worker] Job ${job.id} selesai`);
});

feedbackWorker.on("failed", (job, err) => {
  console.error(`[feedback-worker] Job ${job?.id ?? "unknown"} gagal:`, err.message);
});

feedbackWorker.on("error", (err) => {
  console.error("[feedback-worker] Worker error:", err);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

export async function closeFeedbackWorker(): Promise<void> {
  await feedbackWorker.close();
  await feedbackQueue.close();
}
