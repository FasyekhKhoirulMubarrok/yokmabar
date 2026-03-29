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
  scope: "ALL" | "BRAND";
  scopeValue?: string;
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
 * Ambil event aktif yang berlaku untuk brand tertentu (atau semua game).
 * Prioritas: event BRAND lebih spesifik, tapi kita ambil yang paling baru.
 */
export async function getActiveEvent(brand?: string): Promise<PriceEvent | null> {
  const now = new Date();
  const scopeConditions = brand !== undefined
    ? [{ scope: "ALL" as const }, { scope: "BRAND" as const, scopeValue: brand }]
    : [{ scope: "ALL" as const }];

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
