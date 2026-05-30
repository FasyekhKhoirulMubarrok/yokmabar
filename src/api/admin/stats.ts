import { Hono } from "hono";
import { db } from "../../db/client.js";
import { getBalance } from "../../services/balance.service.js";
import { triggerOndemandSync } from "../../jobs/sync.worker.js";
import { redis } from "../../db/redis.js";
import { getReviewChannelId, setReviewChannelId } from "../../services/review.service.js";

const stats = new Hono();

const SYNC_COOLDOWN_KEY = "sync:ondemand:cooldown";

// GET /api/admin/stats
stats.get("/", async (c) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [balance, totalOrders, successToday, pendingOrders, failedOrders, openTickets, activeEvents] =
    await Promise.allSettled([
      getBalance(),
      db.order.count(),
      db.order.count({ where: { status: "SUCCESS", updatedAt: { gte: startOfDay } } }),
      db.order.count({ where: { status: { in: ["PENDING", "PAID", "PROCESSING"] } } }),
      db.order.count({ where: { status: "FAILED" } }),
      db.feedback.count({ where: { status: { in: ["OPEN", "REPLIED"] } } }),
      db.priceEvent.count({ where: { isActive: true } }),
    ]);

  return c.json({
    balance:      balance.status === "fulfilled" ? balance.value : null,
    totalOrders:  totalOrders.status === "fulfilled" ? totalOrders.value : 0,
    successToday: successToday.status === "fulfilled" ? successToday.value : 0,
    pendingOrders: pendingOrders.status === "fulfilled" ? pendingOrders.value : 0,
    failedOrders: failedOrders.status === "fulfilled" ? failedOrders.value : 0,
    openTickets:  openTickets.status === "fulfilled" ? openTickets.value : 0,
    activeEvents: activeEvents.status === "fulfilled" ? activeEvents.value : 0,
  });
});

// POST /api/admin/sync
stats.post("/sync", async (c) => {
  const cooldown = await redis.ttl(SYNC_COOLDOWN_KEY);
  if (cooldown > 0) {
    return c.json({ message: `Cooldown aktif. Coba lagi dalam ${cooldown} detik.`, cooldown }, 429);
  }
  await triggerOndemandSync();
  return c.json({ ok: true });
});

// GET /api/admin/sync/status
stats.get("/sync/status", async (c) => {
  const cooldown = await redis.ttl(SYNC_COOLDOWN_KEY);
  return c.json({ cooldown: cooldown > 0 ? cooldown : 0 });
});

// GET /api/admin/orders?page=1&status=&search=
stats.get("/orders", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1"));
  const status = c.req.query("status") ?? "";
  const search = c.req.query("search") ?? "";
  const limit = 20;
  const skip = (page - 1) * limit;

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(search ? {
      OR: [
        { id: { contains: search } },
        { gameUserId: { contains: search } },
        { itemName: { contains: search, mode: "insensitive" as never } },
        { user: { username: { contains: search, mode: "insensitive" as never } } },
      ],
    } : {}),
  };

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      include: { user: { select: { username: true, platform: true, platformUserId: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.order.count({ where }),
  ]);

  // Batch-fetch guild names untuk order Discord
  const guildIds = orders
    .map((o) => o.discordGuildId)
    .filter((id): id is string => id !== null);

  const guildMap: Record<string, string | null> = {};
  if (guildIds.length > 0) {
    const guilds = await db.serverReferral.findMany({
      where: { guildId: { in: guildIds } },
      select: { guildId: true, guildName: true },
    });
    for (const g of guilds) {
      guildMap[g.guildId] = g.guildName;
    }
  }

  const ordersWithGuild = orders.map((o) => ({
    ...o,
    guildName: o.discordGuildId !== null ? (guildMap[o.discordGuildId] ?? null) : null,
  }));

  return c.json({ orders: ordersWithGuild, total, page, pages: Math.ceil(total / limit) });
});

// ─── Revenue / Margin ─────────────────────────────────────────────────────────

type RevenueRow = { period: Date; order_count: bigint; revenue: bigint; cost: bigint };

function serializeRows(rows: RevenueRow[]) {
  return rows.map((r) => ({
    period: r.period.toISOString(),
    orderCount: Number(r.order_count),
    revenue: Number(r.revenue),
    cost: Number(r.cost),
    margin: Number(r.revenue) - Number(r.cost),
  }));
}

// GET /api/admin/revenue
stats.get("/revenue", async (c) => {
  const [daily, weekly, monthly] = await Promise.all([
    db.$queryRaw<RevenueRow[]>`
      SELECT
        DATE_TRUNC('day', o."updatedAt" AT TIME ZONE 'Asia/Jakarta') AS period,
        COUNT(*)                                                        AS order_count,
        COALESCE(SUM(o.amount), 0)                                     AS revenue,
        COALESCE(SUM(COALESCE(p."basePrice", 0)), 0)                   AS cost
      FROM "Order" o
      LEFT JOIN "Product" p ON p."itemCode" = o."itemCode"
      WHERE o.status = 'SUCCESS'
        AND o."updatedAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', o."updatedAt" AT TIME ZONE 'Asia/Jakarta')
      ORDER BY period ASC
    `,
    db.$queryRaw<RevenueRow[]>`
      SELECT
        DATE_TRUNC('week', o."updatedAt" AT TIME ZONE 'Asia/Jakarta') AS period,
        COUNT(*)                                                        AS order_count,
        COALESCE(SUM(o.amount), 0)                                     AS revenue,
        COALESCE(SUM(COALESCE(p."basePrice", 0)), 0)                   AS cost
      FROM "Order" o
      LEFT JOIN "Product" p ON p."itemCode" = o."itemCode"
      WHERE o.status = 'SUCCESS'
        AND o."updatedAt" >= NOW() - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', o."updatedAt" AT TIME ZONE 'Asia/Jakarta')
      ORDER BY period ASC
    `,
    db.$queryRaw<RevenueRow[]>`
      SELECT
        DATE_TRUNC('month', o."updatedAt" AT TIME ZONE 'Asia/Jakarta') AS period,
        COUNT(*)                                                         AS order_count,
        COALESCE(SUM(o.amount), 0)                                      AS revenue,
        COALESCE(SUM(COALESCE(p."basePrice", 0)), 0)                    AS cost
      FROM "Order" o
      LEFT JOIN "Product" p ON p."itemCode" = o."itemCode"
      WHERE o.status = 'SUCCESS'
        AND o."updatedAt" >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', o."updatedAt" AT TIME ZONE 'Asia/Jakarta')
      ORDER BY period ASC
    `,
  ]);

  return c.json({
    daily: serializeRows(daily),
    weekly: serializeRows(weekly),
    monthly: serializeRows(monthly),
  });
});

// GET /api/admin/servers
stats.get("/servers", async (c) => {
  const servers = await db.serverReferral.findMany({
    orderBy: { createdAt: "desc" },
    include: { inviter: true },
  });

  const result = servers.map((s) => ({
    guildId: s.guildId,
    guildName: s.guildName,
    inviterUsername: s.inviter?.username ?? null,
    createdAt: s.createdAt.toISOString(),
  }));

  return c.json({
    total: servers.length,
    withInviter: servers.filter((s) => s.inviterUserId !== null).length,
    noName: servers.filter((s) => s.guildName === null).length,
    servers: result,
  });
});

// ─── Review Channel Config ────────────────────────────────────────────────────

// GET /api/admin/review-channel
stats.get("/review-channel", async (c) => {
  const channelId = await getReviewChannelId();
  return c.json({ channelId });
});

// POST /api/admin/review-channel
stats.post("/review-channel", async (c) => {
  const body = await c.req.json<{ channelId?: string }>();
  if (!body.channelId || body.channelId.trim() === "") {
    return c.json({ message: "channelId wajib diisi" }, 400);
  }
  await setReviewChannelId(body.channelId.trim());
  return c.json({ ok: true, channelId: body.channelId.trim() });
});

// GET /api/admin/reviews?page=1
stats.get("/reviews", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1"));
  const limit = 20;
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    db.review.findMany({
      orderBy: { order: { createdAt: "desc" } },
      skip,
      take: limit,
      include: {
        order: { select: { paymentRef: true, game: true, itemName: true, amount: true, createdAt: true } },
        user: { select: { username: true, platform: true } },
      },
    }),
    db.review.count(),
  ]);

  return c.json({ reviews, total, page, pages: Math.ceil(total / limit) });
});

export default stats;
