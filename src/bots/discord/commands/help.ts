import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { config } from "../../../config.js";

// ─── Slash Command Definition ─────────────────────────────────────────────────

export const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Panduan lengkap fitur YokMabar Bot")
  .setDMPermission(true);

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleHelpCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const bonusPoints = config.REFERRAL_BONUS_POINTS;

  const embed = new EmbedBuilder()
    .setColor(0xf7c102)
    .setTitle("🎮 YokMabar Bot — Panduan Lengkap")
    .setDescription(
      "Top up game kamu lebih cepat, langsung dari Discord — tanpa buka web!\n\u200b",
    )
    .addFields(
      {
        name: "💳 `/topup`",
        value:
          "Top up game favorit kamu.\n" +
          "1. Ketik nama game di kolom **game** — muncul autocomplete\n" +
          "2. Pilih nominal di kolom **nominal**\n" +
          "3. Isi User ID (dan Server ID jika diminta)\n" +
          "4. Bot cek ID otomatis — pastikan sudah benar!\n" +
          "5. Bayar lewat QRIS yang muncul\n" +
          "Semua langkah hanya terlihat oleh kamu (ephemeral). ✅",
        inline: false,
      },
      {
        name: "🎁 `/referral`",
        value:
          "Dapatkan link invite unik kamu.\n" +
          `Setiap transaksi sukses di server yang kamu invite = **+${bonusPoints} poin bonus** otomatis.\n` +
          "Lihat juga statistik: berapa server terinvite dan total bonus yang sudah diterima.",
        inline: false,
      },
      {
        name: "❓ `/help`",
        value: "Tampilkan panduan ini kapan saja.",
        inline: false,
      },
      {
        name: "\u200b",
        value: "**🎯 Sistem Poin**",
        inline: false,
      },
      {
        name: "Cara dapat poin",
        value: "Setiap transaksi sukses → dapat poin otomatis.\nContoh: top up Rp 19.000 → dapat 19 poin.",
        inline: true,
      },
      {
        name: "Cara pakai poin",
        value: "200 poin = diskon Rp 1.000.\nDitawarkan otomatis saat checkout jika saldo ≥ 200 poin.",
        inline: true,
      },
      {
        name: "Masa berlaku poin",
        value: "90 hari sejak transaksi terakhir.\nOtomatis diperpanjang setiap kali transaksi baru.",
        inline: true,
      },
      {
        name: "\u200b",
        value: "**💡 Tips**",
        inline: false,
      },
      {
        name: "Validasi ID Otomatis",
        value: "Free Fire & Mobile Legends: ID dicek ke server game sebelum lanjut. Pastikan User ID dan Server ID sudah benar.",
        inline: false,
      },
      {
        name: "Game yang butuh Server ID",
        value: "Mobile Legends, Genshin Impact, Honkai: Star Rail — kamu akan diminta isi Server ID saat top up.",
        inline: false,
      },
      {
        name: "Pembayaran",
        value: "Menggunakan **QRIS** — bisa dibayar lewat semua e-wallet (GoPay, OVO, Dana, ShopeePay) dan mobile banking.",
        inline: false,
      },
      {
        name: "Butuh bantuan?",
        value: "Gunakan fitur feedback di bot atau hubungi admin di channel support server ini.\n🌐 yokmabar.com",
        inline: false,
      },
    )
    .setFooter({ text: "YokMabar · Top up cepat, langsung gas!" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
