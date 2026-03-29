import { Worker, type Job } from "bullmq";
import { createHash } from "crypto";
import { db } from "../db/client.js";
import { redis } from "../db/redis.js";
import {
  connectionOptions,
  QUEUE_NAMES,
  syncQueue,
  type SyncJobData,
  type SyncJobName,
} from "./queue.js";
import { config } from "../config.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const DIGIFLAZZ_PRICE_LIST_URL = "https://api.digiflazz.com/v1/price-list";
const ONDEMAND_COOLDOWN_KEY = "sync:ondemand:cooldown";
const ONDEMAND_COOLDOWN_TTL = 60 * 15; // 15 menit

const POPULAR_BRANDS = [
  "Mobile Legends",
  "Free Fire",
  "PUBG Mobile",
  "Genshin Impact",
  "Valorant",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DigiflazzProduct {
  product_name: string;
  category: string;
  brand: string;
  type: string;
  price: number;
  buyer_sku_code: string;
  buyer_product_status: boolean;
  seller_product_status: boolean;
  unlimited_stock: boolean;
  stock: number;
  desc: string;
}

// ─── Signature ────────────────────────────────────────────────────────────────

function createPriceListSign(): string {
  const raw = `${config.DIGIFLAZZ_USERNAME}${config.DIGIFLAZZ_API_KEY}pricelist`;
  return createHash("md5").update(raw).digest("hex");
}

// ─── Fetch Price List ─────────────────────────────────────────────────────────

async function fetchPriceList(): Promise<DigiflazzProduct[]> {
  const sign = createPriceListSign();

  const response = await fetch(DIGIFLAZZ_PRICE_LIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cmd: "prepaid",
      username: config.DIGIFLAZZ_USERNAME,
      sign,
    }),
  });

  if (!response.ok) {
    throw new Error(`Digiflazz price-list error: HTTP ${response.status}`);
  }

  const json = (await response.json()) as { data: DigiflazzProduct[] };
  return json.data ?? [];
}

// ─── Filter Helpers ───────────────────────────────────────────────────────────

function isGameProduct(p: DigiflazzProduct): boolean {
  return p.category === "Games";
}

function isActiveProduct(p: DigiflazzProduct): boolean {
  return (
    p.buyer_product_status &&
    p.seller_product_status &&
    (p.unlimited_stock || p.stock > 0)
  );
}

function isInquiryProduct(p: DigiflazzProduct): boolean {
  return p.product_name.toLowerCase().includes("cek username");
}

function isPopularBrand(brand: string): boolean {
  return (POPULAR_BRANDS as readonly string[]).some(
    (b) => b.toLowerCase() === brand.toLowerCase(),
  );
}

// ─── Markup ───────────────────────────────────────────────────────────────────

function applyMarkup(price: number): number {
  return Math.ceil(price * (1 + config.PRICE_MARKUP_RATE));
}

// ─── Upsert to DB ─────────────────────────────────────────────────────────────

async function upsertProducts(products: DigiflazzProduct[]): Promise<number> {
  const now = new Date();
  let count = 0;

  // Batch upsert per 100 produk agar tidak timeout
  const BATCH_SIZE = 100;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);

    await db.$transaction(
      batch.map((p) =>
        db.product.upsert({
          where: { itemCode: p.buyer_sku_code },
          create: {
            brand: p.brand,
            category: p.category,
            itemCode: p.buyer_sku_code,
            itemName: p.product_name,
            basePrice: p.price,
            price: applyMarkup(p.price),
            isActive: isActiveProduct(p),
            isPopular: isPopularBrand(p.brand),
            lastSyncedAt: now,
          },
          update: {
            itemName: p.product_name,
            basePrice: p.price,
            price: applyMarkup(p.price),
            isActive: isActiveProduct(p),
            isPopular: isPopularBrand(p.brand),
            lastSyncedAt: now,
          },
        }),
      ),
    );

    count += batch.length;
  }

  return count;
}

// ─── Invalidate Cache ─────────────────────────────────────────────────────────

async function invalidateProductCache(brands?: string[]): Promise<void> {
  if (brands !== undefined && brands.length > 0) {
    const keys = brands.map((b) => `products:brand:${b.toLowerCase()}`);
    await redis.del(...keys);
  } else {
    const keys = await redis.keys("products:*");
    if (keys.length > 0) await redis.del(...keys);
  }
}

// ─── Sync Strategies ──────────────────────────────────────────────────────────

async function runFullSync(): Promise<void> {
  console.info("[sync-worker] Full sync dimulai...");
  const all = await fetchPriceList();
  const games = all.filter((p) => isGameProduct(p) && !isInquiryProduct(p));
  const count = await upsertProducts(games);
  await invalidateProductCache();
  console.info(`[sync-worker] Full sync selesai — ${count} produk diproses.`);
}

async function runPartialSync(brands: string[]): Promise<void> {
  console.info(`[sync-worker] Partial sync dimulai — brands: ${brands.join(", ")}`);
  const all = await fetchPriceList();
  const filtered = all.filter((p) => isGameProduct(p) && !isInquiryProduct(p) && brands.includes(p.brand));
  const count = await upsertProducts(filtered);
  await invalidateProductCache(brands);
  console.info(`[sync-worker] Partial sync selesai — ${count} produk diproses.`);
}

async function runOndemandSync(): Promise<void> {
  // Cek cooldown 15 menit
  const cooldown = await redis.get(ONDEMAND_COOLDOWN_KEY);
  if (cooldown !== null) {
    const remaining = await redis.ttl(ONDEMAND_COOLDOWN_KEY);
    console.warn(`[sync-worker] On-demand sync ditolak — cooldown ${remaining}s lagi.`);
    return;
  }

  // Set cooldown sebelum sync agar request bersamaan tidak lolos
  await redis.set(ONDEMAND_COOLDOWN_KEY, "1", "EX", ONDEMAND_COOLDOWN_TTL);

  console.info("[sync-worker] On-demand sync dimulai...");
  const all = await fetchPriceList();
  const games = all.filter((p) => isGameProduct(p) && !isInquiryProduct(p));
  const count = await upsertProducts(games);
  await invalidateProductCache();
  console.info(`[sync-worker] On-demand sync selesai — ${count} produk diproses.`);
}

// ─── Processor ───────────────────────────────────────────────────────────────

async function processSync(job: Job<SyncJobData, void, SyncJobName>): Promise<void> {
  const { type, brands } = job.data;

  switch (type) {
    case "full":
      await runFullSync();
      break;

    case "partial":
      await runPartialSync(brands ?? [...POPULAR_BRANDS]);
      break;

    case "ondemand":
      await runOndemandSync();
      break;
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const syncWorker = new Worker<SyncJobData, void, SyncJobName>(
  QUEUE_NAMES.SYNC,
  processSync,
  {
    connection: { ...connectionOptions, maxRetriesPerRequest: null },
    concurrency: 1, // sync harus serial — jangan jalankan 2 sync bersamaan
  },
);

// ─── Events ───────────────────────────────────────────────────────────────────

syncWorker.on("completed", (job) => {
  console.info(`[sync-worker] Job ${job.id} (${job.data.type}) selesai.`);
});

syncWorker.on("failed", (job, err) => {
  console.error(
    `[sync-worker] Job ${job?.id ?? "unknown"} (${job?.data.type ?? "-"}) gagal: ${err.message}`,
  );
});

syncWorker.on("error", (err) => {
  console.error("[sync-worker] Worker error:", err);
});

// ─── Schedulers ───────────────────────────────────────────────────────────────

/**
 * Daftarkan repeatable jobs saat startup:
 * - Full sync  : setiap hari jam 03.00 WIB (UTC+7 = 20.00 UTC)
 * - Partial sync: setiap 6 jam
 */
export async function registerSyncSchedules(): Promise<void> {
  // Hapus jadwal lama agar tidak duplikat saat restart
  const repeatable = await syncQueue.getRepeatableJobs();
  for (const job of repeatable) {
    await syncQueue.removeRepeatableByKey(job.key);
  }

  // Full sync jam 03.00 WIB = 20.00 UTC
  await syncQueue.add(
    "full-sync",
    { type: "full" },
    { repeat: { pattern: "0 20 * * *" }, jobId: "full-sync-daily" },
  );

  // Partial sync setiap 6 jam
  await syncQueue.add(
    "partial-sync",
    { type: "partial", brands: [...POPULAR_BRANDS] },
    { repeat: { every: 6 * 60 * 60 * 1000 }, jobId: "partial-sync-6h" },
  );

  console.info("[sync-worker] Jadwal sync terdaftar: full (03.00 WIB), partial (tiap 6 jam).");
}

// ─── On-Demand Trigger ────────────────────────────────────────────────────────

/**
 * Trigger on-demand sync dari admin command.
 * Cooldown 15 menit ditangani di dalam processor.
 */
export async function triggerOndemandSync(): Promise<void> {
  await syncQueue.add(
    "ondemand-sync",
    { type: "ondemand" },
    { jobId: `ondemand-sync-${Date.now()}` },
  );
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

export async function closeSyncWorker(): Promise<void> {
  await syncWorker.close();
}
