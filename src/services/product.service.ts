import { type Product } from "@prisma/client";
import { db } from "../db/client.js";
import { redis } from "../db/redis.js";

const CACHE_TTL = 60 * 30; // 30 menit

function brandKey(brand: string): string {
  return `products:brand:${brand.toLowerCase()}`;
}

function popularKey(): string {
  return "products:popular";
}

/**
 * Ambil semua produk aktif berdasarkan brand.
 * Redis cache TTL 30 menit — miss → query DB → simpan ke cache.
 */
export async function getProductsByBrand(brand: string): Promise<Product[]> {
  const key = brandKey(brand);

  const cached = await redis.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as Product[];
  }

  const products = await db.product.findMany({
    where: { isActive: true, brand },
    orderBy: [{ price: "asc" }],
  });

  await redis.set(key, JSON.stringify(products), "EX", CACHE_TTL);
  return products;
}

/**
 * Ambil 5 game terpopuler (distinct brand, isPopular = true).
 * Dipakai untuk tampilkan pilihan utama di bot menu.
 */
export async function getPopularBrands(): Promise<string[]> {
  const key = popularKey();

  const cached = await redis.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as string[];
  }

  const rows = await db.product.findMany({
    where: { isActive: true, isPopular: true },
    select: { brand: true },
    orderBy: { displayOrder: "asc" },
    distinct: ["brand"],
    take: 5,
  });

  const brands = rows.map((r) => r.brand);
  await redis.set(key, JSON.stringify(brands), "EX", CACHE_TTL);
  return brands;
}

/**
 * Cari produk berdasarkan keyword (nama item atau brand).
 * Tidak di-cache — dipakai fitur "🔍 Cari game lain".
 */
export async function searchProducts(query: string): Promise<Product[]> {
  const keyword = query.trim();
  if (keyword.length === 0) return [];

  return db.product.findMany({
    where: {
      isActive: true,
      OR: [
        { itemName: { contains: keyword, mode: "insensitive" } },
        { brand: { contains: keyword, mode: "insensitive" } },
        { category: { contains: keyword, mode: "insensitive" } },
      ],
    },
    orderBy: [{ isPopular: "desc" }, { displayOrder: "asc" }],
    take: 20,
  });
}

/**
 * Ambil satu produk berdasarkan itemCode.
 */
export async function getProductByItemCode(itemCode: string): Promise<Product | null> {
  return db.product.findUnique({ where: { itemCode } });
}

/**
 * Invalidasi cache — dipanggil sync worker setelah update harga.
 * Jika brand disertakan, hanya invalidasi cache brand tersebut.
 * Jika tidak, hapus semua cache produk.
 */
export async function invalidateProductCache(brand?: string): Promise<void> {
  if (brand !== undefined) {
    await redis.del(brandKey(brand));
  } else {
    const keys = await redis.keys("products:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
