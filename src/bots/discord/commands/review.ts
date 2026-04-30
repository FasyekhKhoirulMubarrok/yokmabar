import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { db } from "../../../db/client.js";
import { saveReview, hasReview, postReviewToDiscord } from "../../../services/review.service.js";

export async function handleReviewStart(interaction: ButtonInteraction): Promise<void> {
  const orderId = interaction.customId.split(":")[1];
  if (orderId === undefined) return;

  if (await hasReview(orderId)) {
    await interaction.reply({ content: "Kamu sudah pernah review order ini. Makasih! 🙏", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: "Pilih rating kamu:",
    components: [{
      type: 1,
      components: [1, 2, 3, 4, 5].map((n) => ({
        type: 2,
        style: 1,
        label: "⭐".repeat(n),
        custom_id: `rv_star:${orderId}:${n}`,
      })),
    }],
    ephemeral: true,
  });
}

export async function handleReviewStar(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const orderId = parts[1];
  const stars = parts[2];
  if (orderId === undefined || stars === undefined) return;

  const modal = new ModalBuilder()
    .setCustomId(`rv_submit:${orderId}:${stars}`)
    .setTitle(`Review ${"⭐".repeat(Number(stars))}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("comment")
          .setLabel("Komentar (opsional, bisa dikosongkan)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(300)
          .setPlaceholder("Ceritain pengalaman top up kamu..."),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleReviewSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const orderId = parts[1];
  const stars = Number(parts[2]);
  if (orderId === undefined || isNaN(stars)) return;

  await interaction.deferReply({ ephemeral: true });

  if (await hasReview(orderId)) {
    await interaction.editReply("Kamu sudah pernah review order ini. Makasih! 🙏");
    return;
  }

  const comment = interaction.fields.getTextInputValue("comment").trim() || undefined;

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { user: true },
  });
  if (order === null) {
    await interaction.editReply("Order tidak ditemukan.");
    return;
  }

  await saveReview({ orderId, userId: order.userId, stars, comment, platform: "DISCORD" });

  await postReviewToDiscord({
    orderId,
    paymentRef: order.paymentRef ?? orderId,
    game: order.game,
    itemName: order.itemName,
    stars,
    comment,
    platform: "DISCORD",
    username: order.user.username,
  }).catch(() => null);

  await interaction.editReply(`Makasih reviewnya! ${"⭐".repeat(stars)} 🙏`);
}

export async function handleReviewSkip(interaction: ButtonInteraction): Promise<void> {
  await interaction.reply({
    content: "Oke, no problem! Makasih udah top up di YokMabar 🎮",
    ephemeral: true,
  });
}
