import { Client, GatewayIntentBits, Partials, Events, AuditLogEvent } from "discord.js";
import { config } from "../../config.js";
import {
  handleTopupAutocomplete,
  handleTopupCommand,
  handleTopupModalSubmit,
  handleTopupButton,
} from "./commands/topup.js";
import { handleReferralCommand } from "./commands/referral.js";
import { handleHelpCommand } from "./commands/help.js";
import { recordServerReferral } from "../../services/referral.service.js";

// ─── Client ───────────────────────────────────────────────────────────────────

export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

// ─── Ready ────────────────────────────────────────────────────────────────────

discordClient.once(Events.ClientReady, (client) => {
  console.info(`[discord-bot] Bot ${client.user.tag} berjalan.`);
});

// ─── Guild Create (Referral Tracking) ────────────────────────────────────────

discordClient.on(Events.GuildCreate, async (guild) => {
  try {
    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.BotAdd,
      limit: 5,
    });

    const entry = auditLogs.entries.find(
      (e) => e.target?.id === discordClient.user?.id,
    );

    const executor = entry?.executor;
    if (executor != null) {
      await recordServerReferral(guild.id, executor.id, executor.username ?? executor.id);
      console.info(`[discord-bot] Referral dicatat — server: ${guild.name}, inviter: ${executor.username}`);
    }
  } catch (err) {
    // Bot mungkin tidak punya izin VIEW_AUDIT_LOG — abaikan
    console.warn("[discord-bot] Tidak bisa fetch audit log guildCreate:", err);
  }
});

// ─── Interaction Handler ──────────────────────────────────────────────────────

discordClient.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Autocomplete
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === "topup") {
        await handleTopupAutocomplete(interaction);
      }
      return;
    }

    // Slash command
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "topup") {
        await handleTopupCommand(interaction);
      } else if (interaction.commandName === "referral") {
        await handleReferralCommand(interaction);
      } else if (interaction.commandName === "help") {
        await handleHelpCommand(interaction);
      }
      return;
    }

    // Modal submit
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("topup_modal|")) {
        await handleTopupModalSubmit(interaction);
      }
      return;
    }

    // Button
    if (interaction.isButton()) {
      if (
        interaction.customId.startsWith("pay|") ||
        interaction.customId === "topup_cancel"
      ) {
        await handleTopupButton(interaction);
      }
      return;
    }
  } catch (err) {
    console.error("[discord-bot] Error handling interaction:", err);

    // Balas dengan error jika interaction belum direspons
    const errorMsg = "😅 Ups, ada gangguan sebentar. Coba lagi dalam beberapa menit ya!";
    try {
      if (
        interaction.isRepliable() &&
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({ content: errorMsg, ephemeral: true });
      } else if (interaction.isRepliable() && interaction.deferred) {
        await interaction.editReply(errorMsg);
      }
    } catch {
      // Abaikan jika interaction sudah expired
    }
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────

discordClient.on(Events.Error, (err) => {
  console.error("[discord-bot] Client error:", err);
});

// ─── Start / Stop ─────────────────────────────────────────────────────────────

export async function startDiscordBot(): Promise<void> {
  await discordClient.login(config.DISCORD_BOT_TOKEN);
}

export async function stopDiscordBot(): Promise<void> {
  discordClient.destroy();
}
