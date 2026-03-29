import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type ButtonInteraction,
  type ModalActionRowComponentBuilder,
} from "discord.js";
import { db } from "../../../db/client.js";
import { createFeedback, addAdminReply, addUserReply, closeFeedback, getFeedbackWithUser } from "../../../services/feedback.service.js";
import { notifyAdminFeedback, notifyAdminFeedbackUserReply, notifyUserFeedbackReply, notifyUserFeedbackClosed } from "../../../services/notification.service.js";

// ─── Slash Command Definition ─────────────────────────────────────────────────

export const feedbackCommand = new SlashCommandBuilder()
  .setName("feedback")
  .setDescription("Kirim kritik, saran, atau laporan masalah ke admin YokMabar")
  .setDMPermission(true);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateUser(discordId: string, username: string): Promise<string> {
  const user = await db.user.upsert({
    where: { platform_platformUserId: { platform: "DISCORD", platformUserId: discordId } },
    create: { platform: "DISCORD", platformUserId: discordId, username },
    update: { username },
  });
  return user.id;
}

// ─── User: Show Modal ─────────────────────────────────────────────────────────

export async function handleFeedbackCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId("feedback_modal")
    .setTitle("Kirim Feedback ke YokMabar");

  const messageInput = new TextInputBuilder()
    .setCustomId("feedback_message")
    .setLabel("Pesan kamu (kritik, saran, atau laporan)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Contoh: Saya mau laporan top up saya sudah bayar tapi belum masuk...")
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(messageInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

// ─── User: Modal Submit ───────────────────────────────────────────────────────

export async function handleFeedbackModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const message = interaction.fields.getTextInputValue("feedback_message").trim();
  const discordUser = interaction.user;
  const userId = await getOrCreateUser(discordUser.id, discordUser.username);

  const feedback = await createFeedback(userId, message);

  await notifyAdminFeedback(
    feedback.ticketId,
    "DISCORD",
    discordUser.username,
    message,
  );

  await interaction.editReply(
    `✅ **Feedback diterima!**\n\n` +
    `Tiket    : \`#${feedback.ticketId}\`\n` +
    `Pesan    : ${message}\n\n` +
    `Tim kami akan segera merespons. Terima kasih! 🙏`,
  );
}

// ─── Admin: Klik Tombol Balas di Admin Channel ────────────────────────────────

export async function handleAdminFeedbackReplyButton(
  interaction: ButtonInteraction,
): Promise<void> {
  // customId: "fb_admin_reply|FB-XXXXX"
  const ticketId = interaction.customId.split("|")[1] ?? "";

  const modal = new ModalBuilder()
    .setCustomId(`fb_admin_reply_modal|${ticketId}`)
    .setTitle(`Balas Tiket #${ticketId}`);

  const replyInput = new TextInputBuilder()
    .setCustomId("admin_reply_message")
    .setLabel(`Balasan untuk #${ticketId}`)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Ketik balasan kamu di sini...")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(1000);

  const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(replyInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

// ─── Admin: Modal Submit Balasan ──────────────────────────────────────────────

export async function handleAdminFeedbackReplyModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const ticketId = interaction.customId.split("|")[1] ?? "";
  const replyMessage = interaction.fields.getTextInputValue("admin_reply_message").trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const feedback = await getFeedbackWithUser(ticketId);
    if (feedback === null) { await interaction.editReply(`😅 Tiket \`#${ticketId}\` tidak ditemukan.`); return; }

    await addAdminReply(ticketId, replyMessage);
    await notifyUserFeedbackReply(feedback.user.platform, feedback.user.platformUserId, ticketId, replyMessage);
    await interaction.editReply(`✅ Balasan untuk **#${ticketId}** berhasil dikirim ke ${feedback.user.platform}!`);
  } catch (err) {
    console.error("[discord-admin] feedback reply error:", err);
    await interaction.editReply("😅 Gagal mengirim balasan. Coba lagi ya!");
  }
}

// ─── Admin: Tutup Tiket ───────────────────────────────────────────────────────

export async function handleAdminCloseFeedbackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const ticketId = interaction.customId.split("|")[1] ?? "";
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const feedback = await getFeedbackWithUser(ticketId);
    if (feedback === null) { await interaction.editReply(`😅 Tiket \`#${ticketId}\` tidak ditemukan.`); return; }
    if (feedback.status === "CLOSED") { await interaction.editReply(`😊 Tiket \`#${ticketId}\` sudah ditutup sebelumnya.`); return; }

    await closeFeedback(ticketId);
    await notifyUserFeedbackClosed(feedback.user.platform, feedback.user.platformUserId, ticketId);
    await interaction.editReply(`✅ Tiket **#${ticketId}** ditutup dan user sudah dinotifikasi.`);
  } catch (err) {
    console.error("[discord-admin] close feedback error:", err);
    await interaction.editReply("😅 Gagal menutup tiket. Coba lagi ya!");
  }
}

// ─── User: Klik Tombol Balas dari DM ─────────────────────────────────────────

export async function handleUserFeedbackReplyButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const ticketId = interaction.customId.split("|")[1] ?? "";

  const modal = new ModalBuilder()
    .setCustomId(`fb_user_reply_modal|${ticketId}`)
    .setTitle(`Balas Tiket #${ticketId}`);

  const replyInput = new TextInputBuilder()
    .setCustomId("user_reply_message")
    .setLabel(`Pesan balasan kamu`)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(1000);

  const row = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(replyInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

// ─── User: Modal Submit Balasan ───────────────────────────────────────────────

export async function handleUserFeedbackReplyModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const ticketId = interaction.customId.split("|")[1] ?? "";
  const replyMessage = interaction.fields.getTextInputValue("user_reply_message").trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const feedback = await getFeedbackWithUser(ticketId);
    if (feedback === null) { await interaction.editReply(`😅 Tiket \`#${ticketId}\` tidak ditemukan.`); return; }
    if (feedback.status === "CLOSED") { await interaction.editReply(`😊 Tiket **#${ticketId}** sudah ditutup. Buka tiket baru dengan \`/feedback\`.`); return; }

    await addUserReply(ticketId, replyMessage);
    await notifyAdminFeedbackUserReply(ticketId, feedback.user.platform, feedback.user.username ?? null, replyMessage);
    await interaction.editReply(`✅ Balasan kamu untuk tiket **#${ticketId}** sudah dikirim ke admin!`);
  } catch (err) {
    console.error("[discord-user] feedback reply error:", err);
    await interaction.editReply("😅 Gagal mengirim balasan. Coba lagi ya!");
  }
}

// ─── User: Tutup Tiket dari DM ────────────────────────────────────────────────

export async function handleUserCloseFeedbackButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const ticketId = interaction.customId.split("|")[1] ?? "";
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const feedback = await getFeedbackWithUser(ticketId);
    if (feedback === null) { await interaction.editReply(`😅 Tiket \`#${ticketId}\` tidak ditemukan.`); return; }
    if (feedback.status === "CLOSED") { await interaction.editReply(`😊 Tiket **#${ticketId}** sudah ditutup.`); return; }

    await closeFeedback(ticketId);
    await interaction.editReply(`✅ Tiket **#${ticketId}** berhasil ditutup. Terima kasih! 🙏`);
  } catch (err) {
    console.error("[discord-user] close feedback error:", err);
    await interaction.editReply("😅 Gagal menutup tiket. Coba lagi ya!");
  }
}
