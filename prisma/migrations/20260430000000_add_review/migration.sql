CREATE TABLE "Review" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "stars"     INTEGER NOT NULL,
  "comment"   TEXT,
  "platform"  "Platform" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");
CREATE INDEX "Review_userId_idx" ON "Review"("userId");
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
