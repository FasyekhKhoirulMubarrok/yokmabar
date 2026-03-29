import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { db } from "../../../db/client.js";
import { config } from "../../../config.js";
import { buildInviteUrl, getReferralStats } from "../../../services/referral.service.js";

// ─── Slash Command Definition ─────────────────────────────────────────────────

export const referralCommand = new SlashCommandBuilder()
  .setName("referral")
  .setDescription("Dapatkan link invite unik kamu dan lihat statistik referral!")
  .setDMPermission(true);

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleReferralCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const discordUser = interaction.user;

  // Pastikan user ada di DB
  const user = await db.user.upsert({
    where: {
      platform_platformUserId: {
        platform: "DISCORD",
        platformUserId: discordUser.id,
      },
    },
    create: { platform: "DISCORD", platformUserId: discordUser.id, username: discordUser.username },
    update: { username: discordUser.username },
  });

  const [inviteUrl, stats] = await Promise.all([
    buildInviteUrl(user.id),
    getReferralStats(user.id),
  ]);

  const bonusPerTx = config.REFERRAL_BONUS_POINTS;

  const embed = new EmbedBuilder()
    .setColor(0x00b4d8)
    .setTitle("🎁 Program Referral YokMabar")
    .setDescription(
      "Invite YokMabar Bot ke server Discord lain pakai link kamu.\n" +
      "Setiap transaksi sukses di server itu = poin bonus buat kamu — otomatis! 🚀",
    )
    .addFields(
      {
        name: "🔗 Link Invite Kamu",
        value: `[Klik untuk invite bot ke server lain](${inviteUrl})\n\`\`\`${inviteUrl}\`\`\``,
        inline: false,
      },
      {
        name: "💰 Bonus per Transaksi",
        value: `+${bonusPerTx} poin`,
        inline: true,
      },
      {
        name: "🏠 Server Terinvite",
        value: `${stats.totalServers} server`,
        inline: true,
      },
      {
        name: "🎯 Total Bonus Diterima",
        value: `${stats.totalBonusPoints} poin`,
        inline: true,
      },
    )
    .setFooter({ text: "YokMabar · Makin banyak server, makin banyak bonus!" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
