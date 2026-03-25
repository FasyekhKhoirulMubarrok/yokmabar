import { Hono } from "hono";
import {
  validateWebhook,
  PaymentError,
  type DuitkuWebhookPayload,
} from "../services/payment.service.js";
import {
  getOrderByPaymentRef,
  markAsPaid,
} from "../services/order.service.js";
import {
  cancelOrderExpiry,
  enqueueOrderProcessing,
} from "../jobs/queue.js";

const webhookDuitku = new Hono();

webhookDuitku.post("/", async (c) => {
  // ── 1. Parse body (application/x-www-form-urlencoded) ─────────────────────
  const body = await c.req.parseBody();

  const payload: DuitkuWebhookPayload = {
    merchantCode: String(body["merchantCode"] ?? ""),
    amount: String(body["amount"] ?? ""),
    merchantOrderId: String(body["merchantOrderId"] ?? ""),
    resultCode: String(body["resultCode"] ?? ""),
    signature: String(body["signature"] ?? ""),
    ...(body["productDetail"] !== undefined && { productDetail: String(body["productDetail"]) }),
    ...(body["additionalParam"] !== undefined && { additionalParam: String(body["additionalParam"]) }),
    ...(body["paymentCode"] !== undefined && { paymentCode: String(body["paymentCode"]) }),
    ...(body["merchantUserId"] !== undefined && { merchantUserId: String(body["merchantUserId"]) }),
    ...(body["reference"] !== undefined && { reference: String(body["reference"]) }),
    ...(body["publisherOrderId"] !== undefined && { publisherOrderId: String(body["publisherOrderId"]) }),
    ...(body["settlementDate"] !== undefined && { settlementDate: String(body["settlementDate"]) }),
    ...(body["issuerCode"] !== undefined && { issuerCode: String(body["issuerCode"]) }),
  };

  // ── 2. Validasi signature ──────────────────────────────────────────────────
  let isPaid: boolean;
  try {
    isPaid = validateWebhook(payload);
  } catch (err) {
    if (err instanceof PaymentError) {
      console.warn(`[webhook-duitku] Signature tidak valid: ${err.message}`);
      return c.json({ message: err.message }, 400);
    }
    throw err;
  }

  // ── 3. Hanya proses jika pembayaran sukses ─────────────────────────────────
  if (!isPaid) {
    console.info(
      `[webhook-duitku] Payment belum sukses — resultCode: ${payload.resultCode}, ` +
        `order: ${payload.merchantOrderId}`,
    );
    return c.json({ message: "ok" }, 200);
  }

  // ── 4. Idempotency check ───────────────────────────────────────────────────
  const order = await getOrderByPaymentRef(payload.merchantOrderId);

  if (order === null) {
    // Order tidak ada di sistem — balas 200 agar Duitku tidak retry terus
    console.warn(
      `[webhook-duitku] Order ${payload.merchantOrderId} tidak ditemukan.`,
    );
    return c.json({ message: "ok" }, 200);
  }

  if (order.status !== "PENDING") {
    // Sudah diproses sebelumnya — idempotent, balas 200
    console.info(
      `[webhook-duitku] Order ${order.id} sudah berstatus ${order.status}, skip.`,
    );
    return c.json({ message: "ok" }, 200);
  }

  // ── 5. PENDING → PAID ──────────────────────────────────────────────────────
  const paymentCode = payload.paymentCode ?? "UNKNOWN";
  await markAsPaid(order.id, paymentCode);

  // ── 6. Batalkan expire job + antri proses top-up ───────────────────────────
  await Promise.all([
    cancelOrderExpiry(order.id),
    enqueueOrderProcessing(order.id),
  ]);

  console.info(
    `[webhook-duitku] Order ${order.id} → PAID via ${paymentCode}, queued for processing.`,
  );

  return c.json({ message: "ok" }, 200);
});

export default webhookDuitku;
