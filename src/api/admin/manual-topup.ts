import { Hono } from "hono";
import { randomBytes } from "crypto";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import { topUp } from "../../services/supplier.service.js";
import { earnPoints } from "../../services/point.service.js";
import { logger } from "../../utils/logger.js";

const manualTopup = new Hono();

// ─── Constants ────────────────────────────────────────────────────────────────

const RATE_LIMIT_KEY = "admin:manual-topup:rate";
const RATE_LIMIT_MAX = 5;        // max 5 eksekusi per window
const RATE_LIMIT_WINDOW = 60;    // window 60 detik
const TOKEN_TTL = 120;           // confirm token valid 2 menit

// Status yang boleh di-retry manual
const RETRYABLE_STATUSES = ["PAID", "FAILED"] as const;

// ─── Rate limiter ─────────────────────────────────────────────────────────────

async function checkRateLimit(): Promise<{ allowed: boolean; remaining: number }> {
  const count = await redis.incr(RATE_LIMIT_KEY);
  if (count === 1) await redis.expire(RATE_LIMIT_KEY, RATE_LIMIT_WINDOW);
  const remaining = Math.max(0, RATE_LIMIT_MAX - count);
  return { allowed: count <= RATE_LIMIT_MAX, remaining };
}

// ─── Lookup order ─────────────────────────────────────────────────────────────

// GET /api/admin/manual-topup/lookup?q=xxx
// Cari order by ID (partial) atau paymentRef (YM-XXXXX)
manualTopup.get("/lookup", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";

  if (q.length < 3) {
    return c.json({ message: "Masukkan minimal 3 karakter" }, 400);
  }

  const orders = await db.order.findMany({
    where: {
      OR: [
        { id: { startsWith: q } },
        { paymentRef: { contains: q, mode: "insensitive" } },
        { supplierRef: { contains: q, mode: "insensitive" } },
      ],
    },
    include: { user: { select: { platform: true, platformUserId: true, username: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return c.json(orders);
});

// ─── Generate confirm token ───────────────────────────────────────────────────

// POST /api/admin/manual-topup/prepare
// Validasi order dan issue one-time token untuk konfirmasi
manualTopup.post("/prepare", async (c) => {
  const body = await c.req.json<{ orderId: string }>();
  const { orderId } = body;

  if (!orderId) return c.json({ message: "orderId wajib diisi" }, 400);

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { platform: true, platformUserId: true, username: true } } },
  });

  if (order === null) {
    return c.json({ message: "Order tidak ditemukan" }, 404);
  }

  if (!(RETRYABLE_STATUSES as readonly string[]).includes(order.status)) {
    return c.json({
      message: `Order status "${order.status}" tidak bisa di-retry. Hanya PAID dan FAILED yang diizinkan.`,
    }, 422);
  }

  // Issue one-time token — simpan di Redis dengan TTL 2 menit
  const token = randomBytes(24).toString("hex");
  const tokenKey = `admin:manual-topup:token:${token}`;
  await redis.set(tokenKey, orderId, "EX", TOKEN_TTL);

  logger.info("[manual-topup] prepare", {
    orderId,
    status: order.status,
    itemName: order.itemName,
    gameUserId: order.gameUserId,
  });

  return c.json({ token, expiresIn: TOKEN_TTL });
});

// ─── Execute ──────────────────────────────────────────────────────────────────

// POST /api/admin/manual-topup/execute
// Kirim top-up ke Digiflazz. Wajib ada token valid dari /prepare.
manualTopup.post("/execute", async (c) => {
  // Rate limit
  const { allowed, remaining } = await checkRateLimit();
  if (!allowed) {
    logger.warn("[manual-topup] rate limit hit");
    return c.json({ message: `Rate limit: tunggu 60 detik. Sisa kuota: ${remaining}` }, 429);
  }

  const body = await c.req.json<{ orderId: string; token: string }>();
  const { orderId, token } = body;

  if (!orderId || !token) {
    return c.json({ message: "orderId dan token wajib diisi" }, 400);
  }

  // Validasi one-time token
  const tokenKey = `admin:manual-topup:token:${token}`;
  const tokenOrderId = await redis.get(tokenKey);

  if (tokenOrderId === null) {
    return c.json({ message: "Token tidak valid atau sudah kedaluwarsa. Buka lagi dari halaman pencarian." }, 401);
  }
  if (tokenOrderId !== orderId) {
    return c.json({ message: "Token tidak cocok dengan order ini." }, 401);
  }

  // Hapus token segera — one-time use
  await redis.del(tokenKey);

  // Re-fetch order (pastikan status masih valid saat eksekusi)
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (order === null) {
    return c.json({ message: "Order tidak ditemukan" }, 404);
  }
  if (!(RETRYABLE_STATUSES as readonly string[]).includes(order.status)) {
    return c.json({
      message: `Status berubah menjadi "${order.status}" — tidak bisa dieksekusi lagi.`,
    }, 422);
  }

  // Ref ID untuk Digiflazz — gunakan prefix RETRY agar idempotent dan bisa dilacak
  const refId = `RETRY-${order.id.slice(0, 8).toUpperCase()}-${Date.now()}`;
  const customerNo = order.gameServerId
    ? `${order.gameUserId}${order.gameServerId}`
    : order.gameUserId;

  logger.info("[manual-topup] execute start", {
    orderId,
    refId,
    itemCode: order.itemCode,
    itemName: order.itemName,
    customerNo,
    prevStatus: order.status,
  });

  // Set status PROCESSING dulu (bypass state machine untuk kasus retry FAILED)
  await db.order.update({
    where: { id: orderId },
    data: {
      status: "PROCESSING",
      supplierRef: refId,
      adminNote: `Manual top-up oleh admin — ${new Date().toISOString()}`,
    },
  });

  let digiResult: { status: "Sukses" | "Pending" | "Gagal"; rc: string; sn: string; message: string } | null = null;
  let execError: string | null = null;

  try {
    digiResult = await topUp({
      refId,
      buyerSkuCode: order.itemCode,
      customerNo,
    });
  } catch (err) {
    execError = err instanceof Error ? err.message : String(err);
    logger.error("[manual-topup] digiflazz error", { orderId, refId, error: execError });
  }

  // Update status berdasarkan hasil
  if (digiResult?.status === "Sukses") {
    await db.order.update({
      where: { id: orderId },
      data: { status: "SUCCESS" },
    });

    // Earn points jika belum punya (idempotent via Point.orderId unique)
    try {
      await earnPoints(order.userId, orderId, order.amount);
    } catch {
      // Tidak gagalkan proses jika poin sudah ada
    }

    logger.info("[manual-topup] SUCCESS", { orderId, refId, sn: digiResult.sn });

    return c.json({
      success: true,
      status: "Sukses",
      rc: digiResult.rc,
      sn: digiResult.sn,
      message: digiResult.message,
      refId,
    });
  }

  if (digiResult?.status === "Pending") {
    // Tetap PROCESSING — tunggu webhook Digiflazz
    logger.info("[manual-topup] PENDING — tunggu webhook", { orderId, refId });

    return c.json({
      success: true,
      status: "Pending",
      rc: digiResult.rc,
      sn: "",
      message: "Top-up sedang diproses Digiflazz. Tunggu webhook masuk.",
      refId,
    });
  }

  // Gagal / error — kembalikan ke FAILED
  const failNote = execError ?? digiResult?.message ?? "Gagal tanpa pesan";
  await db.order.update({
    where: { id: orderId },
    data: { status: "FAILED", adminNote: `Manual retry gagal: ${failNote}` },
  });

  logger.warn("[manual-topup] FAILED", { orderId, refId, note: failNote });

  return c.json({
    success: false,
    status: "Gagal",
    rc: digiResult?.rc ?? "ERR",
    sn: "",
    message: failNote,
    refId,
  }, 200);
});

export default manualTopup;
