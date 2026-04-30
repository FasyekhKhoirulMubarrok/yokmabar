-- Add guildName column to ServerReferral
ALTER TABLE "ServerReferral" ADD COLUMN "guildName" TEXT;

-- Make inviterUserId nullable (to allow tracking servers without known inviter)
ALTER TABLE "ServerReferral" ALTER COLUMN "inviterUserId" DROP NOT NULL;
