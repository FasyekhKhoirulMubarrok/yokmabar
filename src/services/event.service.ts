import { type PriceEvent } from "@prisma/client";
import { db } from "../db/client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EventPricing {
  actualPrice: number;
  strikethroughPrice: number;
  discountPercent: number;
}

export interface CreateEventInput {
  name: string;
  displayMarkupRate: number;
  actualMarkupRate: number;
  scope: "ALL" | "BRAND" | "ITEMS";
  scopeValue?: string;
  scopeItemCodes?: string[];
  startAt?: Date;
  endAt?: Date;
}

// ─── Pricing Calculator ───────────────────────────────────────────────────────

/**
 * Hitung harga event dari basePrice dan konfigurasi event.
 * actualPrice    = harga yang user bayar (e.g. +3%)
 * strikethroughPrice = harga coret palsu (e.g. +14%)
 * discountPercent    = persentase diskon yang ditampilkan
 */
export function applyEventPricing(basePrice: number, event: PriceEvent): EventPricing {
  const actualPrice = Math.ceil(basePrice * (1 + event.actualMarkupRate));
  const strikethroughPrice = Math.ceil(basePrice * (1 + event.displayMarkupRate));
  const discountPercent = Math.round((1 - actualPrice / strikethroughPrice) * 100);
  return { actualPrice, strikethroughPrice, discountPercent };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Ambil event aktif yang berlaku untuk brand/itemCode tertentu.
 * Scope ITEMS: event hanya berlaku jika itemCode ada di scopeItemCodes.
 * Scope BRAND: berlaku untuk semua item dari brand tersebut.
 * Scope ALL: berlaku untuk semua item.
 */
/**
 * Ambil event aktif yang berlaku untuk brand/itemCode tertentu.
 * - includeItemsScope=true: sertakan ITEMS-scope events (tanpa filter itemCode),
 *   berguna saat render nominal list — caller wajib cek scopeItemCodes per item.
 */
export async function getActiveEvent(
  brand?: string,
  itemCode?: string,
  includeItemsScope = false,
): Promise<PriceEvent | null> {
  const now = new Date();

  const scopeConditions: object[] = [{ scope: "ALL" as const }];
  if (brand !== undefined) {
    scopeConditions.push({ scope: "BRAND" as const, scopeValue: brand });
  }
  if (itemCode !== undefined) {
    scopeConditions.push({ scope: "ITEMS" as const, scopeItemCodes: { has: itemCode } });
  } else if (includeItemsScope) {
    scopeConditions.push({ scope: "ITEMS" as const });
  }

  return db.priceEvent.findFirst({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startAt: null }, { startAt: { lte: now } }] },
        { OR: [{ endAt: null }, { endAt: { gt: now } }] },
        { OR: scopeConditions },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Helper: cek apakah event berlaku untuk item tertentu */
export function eventAppliesToItem(event: PriceEvent, itemCode: string): boolean {
  if (event.scope === "ALL" || event.scope === "BRAND") return true;
  if (event.scope === "ITEMS") return event.scopeItemCodes.includes(itemCode);
  return false;
}

export async function listEvents(): Promise<PriceEvent[]> {
  return db.priceEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function getEventByShortId(shortId: string): Promise<PriceEvent | null> {
  return db.priceEvent.findFirst({
    where: { id: { startsWith: shortId } },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createEvent(data: CreateEventInput): Promise<PriceEvent> {
  return db.priceEvent.create({
    data: {
      name: data.name,
      displayMarkupRate: data.displayMarkupRate,
      actualMarkupRate: data.actualMarkupRate,
      scope: data.scope,
      scopeValue: data.scopeValue ?? null,
      scopeItemCodes: data.scopeItemCodes ?? [],
      startAt: data.startAt ?? null,
      endAt: data.endAt ?? null,
    },
  });
}

export async function startEvent(id: string): Promise<PriceEvent> {
  return db.priceEvent.update({ where: { id }, data: { isActive: true } });
}

export async function stopEvent(id: string): Promise<PriceEvent> {
  return db.priceEvent.update({ where: { id }, data: { isActive: false } });
}

export async function deleteEvent(id: string): Promise<void> {
  await db.priceEvent.delete({ where: { id } });
}
