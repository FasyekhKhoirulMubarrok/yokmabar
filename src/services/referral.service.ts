import { db } from "../db/client.js";
import { config } from "../config.js";

// ─── Record Referral ──────────────────────────────────────────────────────────

/**
 * Simpan siapa yang mengundang bot ke server Discord.
 * Dipanggil saat event guildCreate oleh discord bot.
 * Jika server sudah ada di DB, abaikan (tidak override inviter).
 */
export async function recordServerReferral(
  guildId: string,
  inviterDiscordId: string,
  inviterUsername: string,
): Promise<void> {
  // Cegah override — jika sudah ada, skip
  const existing = await db.serverReferral.findUnique({ where: { guildId } });
  if (existing !== null) return;

  const user = await db.user.upsert({
    where: {
      platform_platformUserId: {
        platform: "DISCORD",
        platformUserId: inviterDiscordId,
      },
    },
    create: { platform: "DISCORD", platformUserId: inviterDiscordId, username: inviterUsername },
    update: { username: inviterUsername },
  });

  await db.serverReferral.create({
    data: { guildId, inviterUserId: user.id },
  });
}

// ─── Award Referral Bonus ─────────────────────────────────────────────────────

/**
 * Cek apakah order berasal dari server referral, dan beri poin bonus ke inviter.
 * Return inviter Discord user ID jika bonus diberikan, null jika tidak.
 */
export async function tryAwardReferralBonus(
  orderId: string,
  orderUserId: string,
  discordGuildId: string | null,
): Promise<{ inviterDiscordId: string; bonusPoints: number } | null> {
  if (discordGuildId === null) return null;

  const referral = await db.serverReferral.findUnique({
    where: { guildId: discordGuildId },
    include: { inviter: true },
  });

  if (referral === null) return null;

  // Jangan beri bonus jika inviter = buyer (self-referral)
  if (referral.inviterUserId === orderUserId) return null;

  const bonusPoints = config.REFERRAL_BONUS_POINTS;
  const expiredAt = new Date(
    Date.now() + config.POINT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  await db.point.create({
    data: {
      userId: referral.inviterUserId,
      type: "EARNED",
      amount: bonusPoints,
      description: `Bonus referral server Discord`,
      expiredAt,
    },
  });

  return {
    inviterDiscordId: referral.inviter.platformUserId,
    bonusPoints,
  };
}
