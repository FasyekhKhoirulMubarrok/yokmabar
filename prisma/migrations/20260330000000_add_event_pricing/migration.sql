-- Migration: add_event_pricing
-- Tambah kolom basePrice ke Product, buat tabel PriceEvent

-- 1. Tambah basePrice ke Product (default 0, akan diisi ulang saat sync berikutnya)
ALTER TABLE "Product" ADD COLUMN "basePrice" INTEGER NOT NULL DEFAULT 0;

-- 2. Buat enum EventScope
CREATE TYPE "EventScope" AS ENUM ('ALL', 'BRAND');

-- 3. Buat tabel PriceEvent
CREATE TABLE "PriceEvent" (
  "id"                TEXT              NOT NULL,
  "name"              TEXT              NOT NULL,
  "isActive"          BOOLEAN           NOT NULL DEFAULT false,
  "displayMarkupRate" DOUBLE PRECISION  NOT NULL,
  "actualMarkupRate"  DOUBLE PRECISION  NOT NULL,
  "scope"             "EventScope"      NOT NULL DEFAULT 'ALL',
  "scopeValue"        TEXT,
  "startAt"           TIMESTAMP(3),
  "endAt"             TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceEvent_isActive_idx" ON "PriceEvent"("isActive");
