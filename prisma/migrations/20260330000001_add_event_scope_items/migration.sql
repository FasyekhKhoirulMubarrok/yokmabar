-- Add ITEMS value to EventScope enum
ALTER TYPE "EventScope" ADD VALUE IF NOT EXISTS 'ITEMS';

-- Add scopeItemCodes column to PriceEvent
ALTER TABLE "PriceEvent" ADD COLUMN IF NOT EXISTS "scopeItemCodes" TEXT[] NOT NULL DEFAULT '{}';
