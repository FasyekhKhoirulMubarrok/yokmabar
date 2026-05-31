ALTER TABLE "Product" ADD COLUMN "isDisrupted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "disruptedAt" TIMESTAMP(3);

CREATE INDEX "Product_isDisrupted_idx" ON "Product"("isDisrupted");
