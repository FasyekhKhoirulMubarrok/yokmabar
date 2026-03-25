import { REST, Routes } from "discord.js";
import { config } from "../../config.js";
import { topupCommand } from "./commands/topup.js";

const commands = [topupCommand.toJSON()];

const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN);

async function deploy(): Promise<void> {
  console.info(`[deploy-commands] Mendaftarkan ${commands.length} slash command...`);

  const data = await rest.put(
    Routes.applicationCommands(config.DISCORD_CLIENT_ID),
    { body: commands },
  ) as unknown[];

  console.info(`[deploy-commands] ${data.length} slash command berhasil didaftarkan.`);
}

deploy().catch((err: unknown) => {
  console.error("[deploy-commands] Gagal mendaftarkan commands:", err);
  process.exit(1);
});
