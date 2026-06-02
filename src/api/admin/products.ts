import { Hono } from "hono";
import * as XLSX from "xlsx";
import { db } from "../../db/client.js";
import { applyEventPricing, eventAppliesToItem } from "../../services/event.service.js";

interface ProductRow {
  id: string;
  brand: string;
  category: string;
  itemCode: string;
  itemName: string;
  basePrice: number;
  price: number;
  isActive: boolean;
  isPopular: boolean;
  isDisrupted: boolean;
  displayOrder: number;
}

interface PriceEventRow {
  id: string;
  name: string;
  scope: "ALL" | "BRAND" | "ITEMS";
  scopeValue: string | null;
  scopeItemCodes: string[];
  isActive: boolean;
  displayMarkupRate: number;
  actualMarkupRate: number;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const products = new Hono();

// GET /api/admin/products/brands — daftar semua brand unik
products.get("/brands", async (c) => {
  const brands = await db.product.findMany({
    where: { isActive: true },
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" },
  });
  return c.json((brands as { brand: string }[]).map((b) => b.brand));
});

// GET /api/admin/products?brand=xxx — produk per brand (untuk tabel & event picker)
products.get("/", async (c) => {
  const brand = c.req.query("brand");
  if (brand === undefined || brand === "") {
    return c.json({ message: "brand query param wajib diisi" }, 400);
  }

  const list = await db.product.findMany({
    where: { brand, isActive: true },
    select: { itemCode: true, itemName: true, basePrice: true, price: true, category: true },
    orderBy: [{ category: "asc" }, { itemName: "asc" }],
  });

  return c.json(list);
});

// GET /api/admin/products/list?brand=xxx — produk dengan harga event untuk tabel admin
products.get("/list", async (c) => {
  const brand = c.req.query("brand");

  const where = brand ? { isActive: true, brand } : { isActive: true };
  const [allProducts, activeEvents] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ brand: "asc" }, { category: "asc" }, { price: "asc" }],
    }),
    db.priceEvent.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: new Date() } }] },
          { OR: [{ endAt: null }, { endAt: { gt: new Date() } }] },
        ],
      },
    }),
  ]);

  const result = (allProducts as ProductRow[]).map((p) => {
    const event = findApplicableEvent(activeEvents as PriceEventRow[], p.brand, p.itemCode);
    if (event !== null) {
      const pricing = applyEventPricing(p.basePrice, event);
      return {
        ...p,
        eventName: event.name,
        eventActualPrice: pricing.actualPrice,
        eventStrikethroughPrice: pricing.strikethroughPrice,
        eventDiscountPercent: pricing.discountPercent,
      };
    }
    return { ...p, eventName: null, eventActualPrice: null, eventStrikethroughPrice: null, eventDiscountPercent: null };
  });

  return c.json(result);
});

// GET /api/admin/products/export?brand=xxx — download Excel price list
products.get("/export", async (c) => {
  const brand = c.req.query("brand");

  const where = brand ? { isActive: true, brand } : { isActive: true };
  const [allProducts, activeEvents] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ brand: "asc" }, { category: "asc" }, { price: "asc" }],
    }),
    db.priceEvent.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: new Date() } }] },
          { OR: [{ endAt: null }, { endAt: { gt: new Date() } }] },
        ],
      },
    }),
  ]);

  const idr = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
  const wb = XLSX.utils.book_new();

  // ── Sheet: Semua Produk ────────────────────────────────────────────────────
  const header = [
    "No", "Brand/Game", "Kategori", "Nama Produk", "Kode SKU",
    "Harga Modal", "Harga Normal", "Harga Event", "Harga Coret", "Diskon %", "Event Aktif",
  ];

  const rows = (allProducts as ProductRow[]).map((p, i) => {
    const event = findApplicableEvent(activeEvents as PriceEventRow[], p.brand, p.itemCode);
    if (event !== null) {
      const pricing = applyEventPricing(p.basePrice, event);
      return [
        i + 1, p.brand, p.category, p.itemName, p.itemCode,
        idr(p.basePrice), idr(p.price),
        idr(pricing.actualPrice), idr(pricing.strikethroughPrice),
        `${pricing.discountPercent}%`, event.name,
      ];
    }
    return [
      i + 1, p.brand, p.category, p.itemName, p.itemCode,
      idr(p.basePrice), idr(p.price),
      "—", "—", "—", "—",
    ];
  });

  const wsAll = XLSX.utils.aoa_to_sheet([header, ...rows]);
  wsAll["!cols"] = [
    { wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 42 }, { wch: 22 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, "Semua Produk");

  // ── Sheet per brand ────────────────────────────────────────────────────────
  const typedProducts = allProducts as ProductRow[];
  const typedEvents = activeEvents as PriceEventRow[];
  const brandMap = new Map<string, ProductRow[]>();
  for (const p of typedProducts) {
    if (!brandMap.has(p.brand)) brandMap.set(p.brand, []);
    brandMap.get(p.brand)!.push(p);
  }

  for (const [brandName, items] of brandMap) {
    const brandHeader = [
      "No", "Kategori", "Nama Produk", "Kode SKU",
      "Harga Modal", "Harga Normal", "Harga Event", "Harga Coret", "Diskon %", "Event Aktif",
    ];
    const brandRows = items.map((p, i) => {
      const event = findApplicableEvent(typedEvents, p.brand, p.itemCode);
      if (event !== null) {
        const pricing = applyEventPricing(p.basePrice, event);
        return [
          i + 1, p.category, p.itemName, p.itemCode,
          idr(p.basePrice), idr(p.price),
          idr(pricing.actualPrice), idr(pricing.strikethroughPrice),
          `${pricing.discountPercent}%`, event.name,
        ];
      }
      return [
        i + 1, p.category, p.itemName, p.itemCode,
        idr(p.basePrice), idr(p.price),
        "—", "—", "—", "—",
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([brandHeader, ...brandRows]);
    ws["!cols"] = [
      { wch: 5 }, { wch: 18 }, { wch: 42 }, { wch: 22 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, brandName.slice(0, 31));
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const date = new Date().toISOString().slice(0, 10);
  const filename = brand
    ? `pricelist-${brand.replace(/\s+/g, "-")}-${date}.xlsx`
    : `pricelist-yokmabar-${date}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

function findApplicableEvent(events: PriceEventRow[], brand: string, itemCode: string): PriceEventRow | null {
  // Prioritaskan event ITEMS > BRAND > ALL
  const byItems = events.find(
    (e) => e.scope === "ITEMS" && eventAppliesToItem(e, itemCode),
  );
  if (byItems !== undefined) return byItems;

  const byBrand = events.find(
    (e) => e.scope === "BRAND" && e.scopeValue === brand,
  );
  if (byBrand !== undefined) return byBrand;

  return events.find((e) => e.scope === "ALL") ?? null;
}

export default products;
