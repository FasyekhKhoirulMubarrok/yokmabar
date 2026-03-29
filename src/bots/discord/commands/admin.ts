import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { config } from "../../../config.js";
import {
  listEvents,
  getEventByShortId,
  createEvent,
  startEvent,
  stopEvent,
  deleteEvent,
} from "../../../services/event.service.js";
import { type PriceEvent } from "@prisma/client";

// ─── Command Definition ───────────────────────────────────────────────────────

export const adminCommand = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("Perintah admin YokMabar")
  .setDMPermission(false)
  .addSubcommandGroup((group) =>
    group
      .setName("event")
      .setDescription("Kelola event harga diskon")
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("Tampilkan semua event"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("buat")
          .setDescription("Buat event diskon baru")
          .addStringOption((opt) =>
            opt.setName("nama").setDescription("Nama event").setRequired(true),
          )
          .addNumberOption((opt) =>
            opt
              .setName("display")
              .setDescription("Markup tampil % (harga coret palsu). Contoh: 14")
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(100),
          )
          .addStringOption((opt) =>
            opt
              .setName("scope")
              .setDescription("Berlaku untuk semua game atau satu game?")
              .setRequired(true)
              .addChoices(
                { name: "Semua Game", value: "ALL" },
                { name: "Satu Game", value: "BRAND" },
              ),
          )
          .addStringOption((opt) =>
            opt
              .setName("brand")
              .setDescription("Nama game jika scope=Satu Game (contoh: Free Fire)")
              .setRequired(false),
          )
          .addStringOption((opt) =>
            opt
              .setName("enddate")
              .setDescription("Tanggal berakhir format DD/MM/YYYY (kosong = manual stop)")
              .setRequired(false),
          )
          .addBooleanOption((opt) =>
            opt
              .setName("aktif")
              .setDescription("Langsung aktifkan setelah dibuat? (default: tidak)")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("start")
          .setDescription("Aktifkan event")
          .addStringOption((opt) =>
            opt
              .setName("id")
              .setDescription("8 karakter pertama ID event (dari /admin event list)")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("stop")
          .setDescription("Hentikan event")
          .addStringOption((opt) =>
            opt
              .setName("id")
              .setDescription("8 karakter pertama ID event")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("hapus")
          .setDescription("Hapus event permanen")
          .addStringOption((opt) =>
            opt
              .setName("id")
              .setDescription("8 karakter pertama ID event")
              .setRequired(true),
          ),
      ),
  );

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdminChannel(interaction: ChatInputCommandInteraction): boolean {
  return interaction.channelId === config.DISCORD_ADMIN_CHANNEL_ID;
}

function eventToEmbed(event: PriceEvent, isActive?: boolean): EmbedBuilder {
  const active = isActive !== undefined ? isActive : event.isActive;
  const displayPct = Math.round(event.displayMarkupRate * 100);
  const actualPct = Math.round(event.actualMarkupRate * 100);
  const scope = event.scope === "ALL" ? "Semua Game" : `Game: ${event.scopeValue ?? "-"}`;
  const endDate = event.endAt !== null
    ? new Date(event.endAt).toLocaleDateString("id-ID", {
        day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta",
      })
    : "Manual stop";

  return new EmbedBuilder()
    .setColor(active ? 0x00c853 : 0x757575)
    .setTitle(`${active ? "🟢" : "⚫"} ${event.name}`)
    .addFields(
      { name: "Status",        value: active ? "AKTIF" : "TIDAK AKTIF", inline: true },
      { name: "Tampil",        value: `+${displayPct}% (harga coret)`,  inline: true },
      { name: "Bayar",         value: `+${actualPct}% (margin event)`,  inline: true },
      { name: "Scope",         value: scope,                            inline: true },
      { name: "Berakhir",      value: endDate,                          inline: true },
      { name: "Short ID",      value: `\`${event.id.slice(0, 8)}\``,   inline: true },
    )
    .setFooter({ text: "YokMabar Admin · Event Pricing" })
    .setTimestamp();
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleAdminCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAdminChannel(interaction)) {
    await interaction.reply({ content: "⛔ Perintah ini hanya bisa digunakan di channel admin.", flags: MessageFlags.Ephemeral });
    return;
  }

  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();

  if (group !== "event") return;

  // ── list ────────────────────────────────────────────────────────────────────
  if (sub === "list") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const events = await listEvents();

    if (events.length === 0) {
      await interaction.editReply("📋 Belum ada event. Gunakan `/admin event buat` untuk membuat event baru.");
      return;
    }

    const embeds = events.map((e) => eventToEmbed(e));
    await interaction.editReply({ embeds: embeds.slice(0, 10) }); // Discord max 10 embeds
    return;
  }

  // ── buat ────────────────────────────────────────────────────────────────────
  if (sub === "buat") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const nama = interaction.options.getString("nama", true);
    const displayPct = interaction.options.getNumber("display", true);
    const scope = interaction.options.getString("scope", true) as "ALL" | "BRAND";
    const brand = interaction.options.getString("brand") ?? undefined;
    const endDateStr = interaction.options.getString("enddate") ?? undefined;
    const langsung = interaction.options.getBoolean("aktif") ?? false;

    if (scope === "BRAND" && brand === undefined) {
      await interaction.editReply("😅 Jika scope = Satu Game, wajib mengisi opsi `brand`.");
      return;
    }

    let endAt: Date | undefined;
    if (endDateStr !== undefined) {
      const parts = endDateStr.split("/").map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) {
        await interaction.editReply("😅 Format tanggal tidak valid. Gunakan `DD/MM/YYYY`.");
        return;
      }
      endAt = new Date(parts[2]!, parts[1]! - 1, parts[0]!, 23, 59, 59);
    }

    try {
      const event = await createEvent({
        name: nama,
        displayMarkupRate: displayPct / 100,
        actualMarkupRate: config.PRICE_EVENT_RATE,
        scope,
        ...(brand !== undefined && { scopeValue: brand }),
        ...(endAt !== undefined && { endAt }),
      });

      if (langsung) await startEvent(event.id);

      const embed = eventToEmbed(event, langsung);
      const statusMsg = langsung ? "✅ Event dibuat dan langsung **diaktifkan**!" : "📋 Event dibuat (belum aktif). Gunakan `/admin event start` untuk mengaktifkan.";
      await interaction.editReply({ content: statusMsg, embeds: [embed] });
    } catch (err) {
      console.error("[discord-admin] createEvent error:", err);
      await interaction.editReply("😅 Gagal membuat event. Coba lagi ya!");
    }
    return;
  }

  // ── start ───────────────────────────────────────────────────────────────────
  if (sub === "start") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const shortId = interaction.options.getString("id", true);
    const event = await getEventByShortId(shortId);
    if (event === null) { await interaction.editReply("😅 Event tidak ditemukan."); return; }
    await startEvent(event.id);
    await interaction.editReply({ content: `✅ Event **${event.name}** berhasil diaktifkan! 🚀`, embeds: [eventToEmbed(event, true)] });
    return;
  }

  // ── stop ────────────────────────────────────────────────────────────────────
  if (sub === "stop") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const shortId = interaction.options.getString("id", true);
    const event = await getEventByShortId(shortId);
    if (event === null) { await interaction.editReply("😅 Event tidak ditemukan."); return; }
    await stopEvent(event.id);
    await interaction.editReply({ content: `⏹ Event **${event.name}** dihentikan.`, embeds: [eventToEmbed(event, false)] });
    return;
  }

  // ── hapus ───────────────────────────────────────────────────────────────────
  if (sub === "hapus") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const shortId = interaction.options.getString("id", true);
    const event = await getEventByShortId(shortId);
    if (event === null) { await interaction.editReply("😅 Event tidak ditemukan."); return; }
    const nama = event.name;
    await deleteEvent(event.id);
    await interaction.editReply(`🗑 Event **${nama}** berhasil dihapus.`);
  }
}
