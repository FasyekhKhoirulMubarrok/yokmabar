import { Hono } from "hono";
import {
  validateWebhook,
  PaymentError,
  type MidtransWebhookPayload,
} from "../services/payment.service.js";
import { getOrderByPaymentRef, markAsPaid } from "../services/order.service.js";
import { cancelOrderExpiry, enqueueOrderProcessing } from "../jobs/queue.js";

const webhookMidtrans = new Hono();

webhookMidtrans.post("/", async (c) => {
  // ── 1. Parse JSON body ─────────────────────────────────────────────────────
  const payload = (await c.req.json()) as MidtransWebhookPayload;

  // ── 2. Validasi signature ──────────────────────────────────────────────────
  let isPaid: boolean;
  try {
    isPaid = validateWebhook(payload);
  } catch (err) {
    if (err instanceof PaymentError) {
      console.warn(`[webhook-midtrans] Signature tidak valid: ${err.message}`);
      return c.json({ message: err.message }, 400);
    }
    throw err;
  }

  // ── 3. Hanya proses jika pembayaran sukses ─────────────────────────────────
  if (!isPaid) {
    console.info(
      `[webhook-midtrans] Payment belum sukses — status: ${payload.transaction_status}, ` +
        `order: ${payload.order_id}`,
    );
    return c.json({ message: "ok" }, 200);
  }

  // ── 4. Idempotency check ───────────────────────────────────────────────────
  const order = await getOrderByPaymentRef(payload.order_id);

  if (order === null) {
    console.warn(`[webhook-midtrans] Order ${payload.order_id} tidak ditemukan.`);
    return c.json({ message: "ok" }, 200);
  }

  if (order.status !== "PENDING") {
    console.info(
      `[webhook-midtrans] Order ${order.id} sudah berstatus ${order.status}, skip.`,
    );
    return c.json({ message: "ok" }, 200);
  }

  // ── 5. PENDING → PAID ──────────────────────────────────────────────────────
  await markAsPaid(order.id, payload.payment_type.toUpperCase());

  // ── 6. Batalkan expire job + antri proses top-up ───────────────────────────
  await Promise.all([
    cancelOrderExpiry(order.id),
    enqueueOrderProcessing(order.id),
  ]);

  console.info(
    `[webhook-midtrans] Order ${order.id} → PAID via ${payload.payment_type}, queued for processing.`,
  );

  return c.json({ message: "ok" }, 200);
});

export default webhookMidtrans;
