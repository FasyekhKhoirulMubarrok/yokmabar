import { type Feedback, type FeedbackReply, type User } from "@prisma/client";
import { db } from "../db/client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedbackWithUser = Feedback & {
  user: User;
  replies: FeedbackReply[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateTicketId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `FB-${suffix}`;
}

// Normalisasi input admin: "fb-xxxxx", "FB XXXXX", "FB-XXXXX" → "FB-XXXXX"
export function normalizeTicketId(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "-");
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createFeedback(
  userId: string,
  message: string,
): Promise<Feedback> {
  return db.feedback.create({
    data: {
      ticketId: generateTicketId(),
      userId,
      message,
      status: "OPEN",
    },
  });
}

export async function getFeedbackWithUser(
  ticketId: string,
): Promise<FeedbackWithUser | null> {
  return db.feedback.findUnique({
    where: { ticketId },
    include: { user: true, replies: { orderBy: { createdAt: "asc" } } },
  });
}

export async function addAdminReply(
  ticketId: string,
  message: string,
): Promise<FeedbackReply> {
  const feedback = await db.feedback.findUnique({ where: { ticketId } });
  if (feedback === null) throw new Error(`Tiket ${ticketId} tidak ditemukan`);

  const reply = await db.feedbackReply.create({
    data: { feedbackId: feedback.id, message, fromAdmin: true },
  });

  await db.feedback.update({
    where: { id: feedback.id },
    data: { status: "REPLIED" },
  });

  return reply;
}

export async function addUserReply(
  ticketId: string,
  message: string,
): Promise<FeedbackReply> {
  const feedback = await db.feedback.findUnique({ where: { ticketId } });
  if (feedback === null) throw new Error(`Tiket ${ticketId} tidak ditemukan`);
  if (feedback.status === "CLOSED") throw new Error(`Tiket ${ticketId} sudah ditutup`);

  const reply = await db.feedbackReply.create({
    data: { feedbackId: feedback.id, message, fromAdmin: false },
  });

  await db.feedback.update({
    where: { id: feedback.id },
    data: { status: "OPEN" },
  });

  return reply;
}

export async function closeFeedback(ticketId: string): Promise<Feedback | null> {
  const feedback = await db.feedback.findUnique({ where: { ticketId } });
  if (feedback === null || feedback.status === "CLOSED") return null;

  return db.feedback.update({
    where: { id: feedback.id },
    data: { status: "CLOSED" },
  });
}

// Ambil tiket yang tidak ada aktivitas selama X jam (untuk auto-close)
export async function getInactiveFeedbacks(hours: number): Promise<FeedbackWithUser[]> {
  const threshold = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db.feedback.findMany({
    where: {
      status: { not: "CLOSED" },
      updatedAt: { lt: threshold },
    },
    include: { user: true, replies: { orderBy: { createdAt: "asc" } } },
  });
}
