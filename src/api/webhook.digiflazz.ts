import { Hono } from "hono";
import { db } from "../db/client.js";
import {
  validateWebhook,
  parseWebhookStatus,
  SupplierError,
  type DigiflazzWebhookPayload,
} from "../services/supplier.service.js";
import {
  getOrderBySupplierRef,
  markAsSuccess,
  markAsFailed,
} from "../services/order.service.js";
import { earnPoints, getActivePoints } from "../services/point.service.js";
import { invalidateBalanceCache } from "../services/balance.service.js";
import {
  notifySuccess,
  notifyFailed,
  notifyAdminOrderFailed,
} from "../services/notification.service.js";

const webhookDigiflazz = new Hono();

webhookDigiflazz.post("/", async (c) => {
  // ── 1. Parse JSON body ─────────────────────────────────────────────────────
  let payload: DigiflazzWebhookPayload;
  try {
    payload = await c.req.json<DigiflazzWebhookPayload>();
  } catch {
    return c.json({ message: "Invalid JSON" }, 400);
  }

  // ── debug: log raw payload ────────────────────────────────────────────────
  console.log("[webhook-digiflazz] raw payload:", JSON.stringify(payload));

  // ── 2. Validasi signature ──────────────────────────────────────────────────
  let data: ReturnType<typeof validateWebhook>;
  try {
    data = validateWebhook(payload);
  } catch (err) {
    if (err instanceof SupplierError) {
      console.warn(`[webhook-digiflazz] Signature tidak valid: ${err.message}`);
      return c.json({ message: err.message }, 400);
    }
    throw err;
  }

  const refId = data.ref_id; // ref_id = orderId yang kita kirim saat top-up

  // ── 3. Idempotency check ───────────────────────────────────────────────────
  const order = await getOrderBySupplierRef(refId);

  if (order === null) {
    console.warn(`[webhook-digiflazz] Order dengan ref_id ${refId} tidak ditemukan.`);
    return c.json({ message: "ok" }, 200);
  }

  if (order.status !== "PROCESSING") {
    console.info(
      `[webhook-digiflazz] Order ${order.id} sudah berstatus ${order.status}, skip.`,
    );
    return c.json({ message: "ok" }, 200);
  }

  // ── 4. Ambil user untuk notifikasi ────────────────────────────────────────
  const user = await db.user.findUnique({ where: { id: order.userId } });
  if (user === null) {
    console.error(`[webhook-digiflazz] User ${order.userId} tidak ditemukan.`);
    return c.json({ message: "ok" }, 200);
  }

  // ── 5. Route berdasarkan status Digiflazz ─────────────────────────────────
  const status = parseWebhookStatus(data);

  if (status === "PENDING") {
    // Masih diproses Digiflazz — tunggu webhook berikutnya
    console.info(`[webhook-digiflazz] Order ${order.id} masih PENDING di Digiflazz.`);
    return c.json({ message: "ok" }, 200);
  }

  if (status === "SUCCESS") {
    // PROCESSING → SUCCESS
    const success = await markAsSuccess(order.id);

    const [pointsResult] = await Promise.allSettled([
      earnPoints(order.userId, order.id, order.amount),
      invalidateBalanceCache(),
    ]);

    const pointsEarned =
      pointsResult.status === "fulfilled" ? pointsResult.value : 0;
    const totalPoints = await getActivePoints(order.userId);

    await notifySuccess(
      success,
      user.platform,
      user.platformUserId,
      pointsEarned,
      totalPoints,
    );

    console.info(`[webhook-digiflazz] Order ${order.id} → SUCCESS.`);
    return c.json({ message: "ok" }, 200);
  }

  // status === "FAILED"
  // PROCESSING → FAILED
  const adminNote = data.message ?? "Transaksi gagal di Digiflazz";
  const failed = await markAsFailed(order.id, adminNote);

  await Promise.allSettled([
    notifyFailed(failed, user.platform, user.platformUserId),
    notifyAdminOrderFailed(failed, user.platform, user.username),
  ]);

  console.error(
    `[webhook-digiflazz] Order ${order.id} → FAILED: ${adminNote}`,
  );

  return c.json({ message: "ok" }, 200);
});

export default webhookDigiflazz;
