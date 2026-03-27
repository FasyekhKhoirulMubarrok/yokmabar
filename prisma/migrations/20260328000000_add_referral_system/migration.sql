-- AlterTable
ALTER TABLE "Order" ADD COLUMN "discordGuildId" TEXT;

-- CreateTable
CREATE TABLE "ServerReferral" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerReferral_guildId_key" ON "ServerReferral"("guildId");

-- CreateIndex
CREATE INDEX "ServerReferral_inviterUserId_idx" ON "ServerReferral"("inviterUserId");

-- AddForeignKey
ALTER TABLE "ServerReferral" ADD CONSTRAINT "ServerReferral_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
