import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../../db/client.js";
import {
  getFeedbackWithUser,
  addAdminReply,
  closeFeedback,
} from "../../services/feedback.service.js";
import {
  notifyUserFeedbackReply,
  notifyUserFeedbackClosed,
} from "../../services/notification.service.js";

const feedback = new Hono();

// GET /api/admin/feedback?status=OPEN
feedback.get("/", async (c) => {
  const status = c.req.query("status");

  const where = status
    ? { status: status as "OPEN" | "REPLIED" | "CLOSED" }
    : {};

  const list = await db.feedback.findMany({
    where,
    include: { user: true, replies: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });

  return c.json(list);
});

// GET /api/admin/feedback/:ticketId
feedback.get("/:ticketId", async (c) => {
  const ticketId = c.req.param("ticketId").toUpperCase();
  const ticket = await getFeedbackWithUser(ticketId);
  if (ticket === null) return c.json({ message: "Tiket tidak ditemukan" }, 404);
  return c.json(ticket);
});

// POST /api/admin/feedback/:ticketId/reply
const replySchema = z.object({
  message: z.string().min(1),
});

feedback.post("/:ticketId/reply", zValidator("json", replySchema), async (c) => {
  const ticketId = c.req.param("ticketId").toUpperCase();
  const { message } = c.req.valid("json");

  const ticket = await getFeedbackWithUser(ticketId);
  if (ticket === null) return c.json({ message: "Tiket tidak ditemukan" }, 404);
  if (ticket.status === "CLOSED") {
    return c.json({ message: "Tiket sudah ditutup" }, 400);
  }

  const reply = await addAdminReply(ticketId, message);

  // Notify user on their platform (fire-and-forget, don't block response)
  notifyUserFeedbackReply(
    ticket.user.platform,
    ticket.user.platformUserId,
    ticketId,
    message,
  ).catch(() => undefined);

  return c.json(reply, 201);
});

// PATCH /api/admin/feedback/:ticketId/close
feedback.patch("/:ticketId/close", async (c) => {
  const ticketId = c.req.param("ticketId").toUpperCase();

  const ticket = await getFeedbackWithUser(ticketId);
  if (ticket === null) return c.json({ message: "Tiket tidak ditemukan" }, 404);
  if (ticket.status === "CLOSED") {
    return c.json({ message: "Tiket sudah ditutup" }, 400);
  }

  const updated = await closeFeedback(ticketId);

  notifyUserFeedbackClosed(
    ticket.user.platform,
    ticket.user.platformUserId,
    ticketId,
  ).catch(() => undefined);

  return c.json(updated);
});

export default feedback;
