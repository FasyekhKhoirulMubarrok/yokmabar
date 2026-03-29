import { REST, Routes } from "discord.js";
import { config } from "../../config.js";
import { topupCommand } from "./commands/topup.js";
import { referralCommand } from "./commands/referral.js";
import { helpCommand } from "./commands/help.js";
import { feedbackCommand } from "./commands/feedback.js";

const commands = [topupCommand.toJSON(), referralCommand.toJSON(), helpCommand.toJSON(), feedbackCommand.toJSON()];

const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN);

async function deploy(): Promise<void> {
  console.info(`[deploy-commands] Mendaftarkan ${commands.length} slash command...`);

  // Jika DISCORD_TEST_GUILD_ID di-set, daftarkan ke guild spesifik (instan).
  // Kosongkan env var ini untuk deploy global (propagasi ~1 jam).
  const guildId = process.env.DISCORD_TEST_GUILD_ID;
  const route =
    guildId != null && guildId !== ""
      ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId)
      : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

  const data = (await rest.put(route, { body: commands })) as unknown[];

  const scope =
    guildId != null && guildId !== "" ? `guild ${guildId}` : "global";
  console.info(
    `[deploy-commands] ${data.length} slash command berhasil didaftarkan (${scope}).`,
  );
}

deploy().catch((err: unknown) => {
  console.error("[deploy-commands] Gagal mendaftarkan commands:", err);
  process.exit(1);
});
