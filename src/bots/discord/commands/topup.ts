import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type ModalActionRowComponentBuilder,
} from "discord.js";
import { AttachmentBuilder } from "discord.js";
import { db } from "../../../db/client.js";
import { formatNominalLabel, generateQrBuffer } from "../../../utils/formatter.js";
import {
  getPopularBrands,
  getProductsByBrand,
  searchProducts,
} from "../../../services/product.service.js";
import { getPointSummary, redeemPoints } from "../../../services/point.service.js";
import { createOrder, setPaymentUrl } from "../../../services/order.service.js";
import { createInvoice, type PaymentMethod } from "../../../services/payment.service.js";
import { scheduleOrderExpiry } from "../../../jobs/queue.js";
import { type Product } from "@prisma/client";

// ─── Constants ────────────────────────────────────────────────────────────────

const GAMES_NEED_SERVER_ID = new Set([
  "mobile legends",
  "genshin impact",
  "honkai: star rail",
]);

function needsServerId(brand: string): boolean {
  return GAMES_NEED_SERVER_ID.has(brand.toLowerCase());
}

const PAYMENT_METHODS: { id: string; label: string; method: PaymentMethod }[] = [
  { id: "pay:QRIS",  label: "💳 QRIS",  method: "QRIS"  },
  { id: "pay:GOPAY", label: "💚 GoPay", method: "GOPAY" },
  { id: "pay:OVO",   label: "💜 OVO",   method: "OVO"   },
  { id: "pay:DANA",  label: "💙 Dana",  method: "DANA"  },
];

// ─── Slash Command Definition ─────────────────────────────────────────────────

export const topupCommand = new SlashCommandBuilder()
  .setName("topup")
  .setDescription("Top up game kamu langsung dari Discord!")
  .addStringOption((opt) =>
    opt
      .setName("game")
      .setDescription("Pilih game yang mau di-top up")
      .setAutocomplete(true)
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName("nominal")
      .setDescription("Pilih nominal top up")
      .setAutocomplete(true)
      .setRequired(true),
  );

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

async function getOrCreateUser(discordId: string, username: string): Promise<string> {
  const user = await db.user.upsert({
    where: {
      platform_platformUserId: { platform: "DISCORD", platformUserId: discordId },
    },
    create: { platform: "DISCORD", platformUserId: discordId, username },
    update: { username },
  });
  return user.id;
}

// ─── Autocomplete Handler ─────────────────────────────────────────────────────

export async function handleTopupAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused(true);

  if (focused.name === "game") {
    const query = focused.value.toLowerCase();

    if (query.length === 0) {
      // Tampil 5 brand populer
      const brands = await getPopularBrands();
      await interaction.respond(
        brands.slice(0, 25).map((b) => ({ name: b, value: b })),
      );
      return;
    }

    // Search berdasarkan query
    const products = await searchProducts(query);
    const brands = [...new Set(products.map((p) => p.brand))].slice(0, 25);
    await interaction.respond(brands.map((b) => ({ name: b, value: b })));
    return;
  }

  if (focused.name === "nominal") {
    const selectedBrand = interaction.options.getString("game") ?? "";
    if (selectedBrand.length === 0) {
      await interaction.respond([]);
      return;
    }

    const products = await getProductsByBrand(selectedBrand);
    const filtered = products
      .filter((p) =>
        p.itemName.toLowerCase().includes(focused.value.toLowerCase()),
      )
      .slice(0, 25);

    await interaction.respond(
      filtered.map((p) => ({
        name: formatNominalLabel(selectedBrand, p.itemName, p.price),
        value: p.itemCode,
      })),
    );
  }
}

// ─── Modal: Input User ID + Server ID ────────────────────────────────────────

export function buildTopupModal(brand: string, itemCode: string): ModalBuilder {
  const needsServer = needsServerId(brand);

  const modal = new ModalBuilder()
    .setCustomId(`topup_modal:${brand}:${itemCode}`)
    .setTitle(`Top Up ${brand}`);

  const userIdInput = new TextInputBuilder()
    .setCustomId("gameUserId")
    .setLabel("User ID kamu")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Contoh: 123456789")
    .setRequired(true)
    .setMaxLength(50);

  const row1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(userIdInput);
  modal.addComponents(row1);

  if (needsServer) {
    const serverIdInput = new TextInputBuilder()
      .setCustomId("gameServerId")
      .setLabel("Server ID")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Contoh: 1234")
      .setRequired(true)
      .setMaxLength(20);

    const row2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(serverIdInput);
    modal.addComponents(row2);
  }

  return modal;
}

// ─── ChatInputCommand Handler ─────────────────────────────────────────────────

export async function handleTopupCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const brand = interaction.options.getString("game", true);
  const itemCode = interaction.options.getString("nominal", true);

  // Verifikasi produk ada
  const products = await getProductsByBrand(brand);
  const product = products.find((p) => p.itemCode === itemCode);

  if (product === undefined) {
    await interaction.reply({
      content: "😅 Produk tidak ditemukan. Coba pilih nominal lagi ya!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Tampilkan modal untuk input User ID
  const modal = buildTopupModal(brand, itemCode);
  await interaction.showModal(modal);
}

// ─── Modal Submit Handler ─────────────────────────────────────────────────────

export async function handleTopupModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  // Parse customId: "topup_modal:{brand}:{itemCode}"
  const parts = interaction.customId.split(":");
  const brand = parts[1] ?? "";
  const itemCode = parts[2] ?? "";

  const gameUserId = interaction.fields.getTextInputValue("gameUserId").trim();
  let gameServerId: string | null = null;
  try {
    gameServerId = interaction.fields.getTextInputValue("gameServerId").trim().replace(/\s/g, "") || null;
  } catch {
    gameServerId = null;
  }

  // Defer ephemeral — butuh waktu untuk load produk + poin
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const products = await getProductsByBrand(brand);
  const product = products.find((p) => p.itemCode === itemCode);

  if (product === undefined) {
    await interaction.editReply("😅 Produk tidak ditemukan.");
    return;
  }

  const discordUser = interaction.user;
  const userId = await getOrCreateUser(discordUser.id, discordUser.username);
  const summary = await getPointSummary(userId);

  // Bangun embed konfirmasi
  const idDisplay = gameServerId
    ? `${gameUserId} (Server: ${gameServerId})`
    : gameUserId;

  const embed = new EmbedBuilder()
    .setColor(0x00b4d8)
    .setTitle("📋 Konfirmasi Top Up")
    .addFields(
      { name: "Game",    value: product.brand,            inline: true },
      { name: "Item",    value: product.itemName,          inline: true },
      { name: "Harga",   value: formatRupiah(product.price), inline: true },
      { name: "User ID", value: idDisplay,                 inline: false },
    )
    .setFooter({ text: "YokMabar · Top up cepat, langsung gas!" })
    .setTimestamp();

  // Tambah info poin jika ada
  if (summary.canRedeem) {
    embed.addFields({
      name: "🎁 Poin Tersedia",
      value: `${summary.activePoints} poin (hemat ${formatRupiah(summary.maxDiscount)})`,
      inline: false,
    });
  }

  // Buttons metode bayar + batal
  const payButtons = PAYMENT_METHODS.map((pm) =>
    new ButtonBuilder()
      .setCustomId(`${pm.id}:${userId}:${product.itemCode}:${gameUserId}:${gameServerId ?? ""}`)
      .setLabel(pm.label)
      .setStyle(ButtonStyle.Primary),
  );

  const cancelButton = new ButtonBuilder()
    .setCustomId("topup_cancel")
    .setLabel("❌ Batal")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...payButtons,
    cancelButton,
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ─── Button Handler ───────────────────────────────────────────────────────────

export async function handleTopupButton(
  interaction: ButtonInteraction,
): Promise<void> {
  if (interaction.customId === "topup_cancel") {
    await interaction.update({
      content: "😊 Order dibatalkan. Ketik /topup untuk mulai lagi!",
      embeds: [],
      components: [],
    });
    return;
  }

  // Format: "pay:{METHOD}:{userId}:{itemCode}:{gameUserId}:{gameServerId}"
  const [, methodStr, userId, itemCode, gameUserId, gameServerIdRaw] =
    interaction.customId.split(":");

  const gameServerId = gameServerIdRaw !== "" ? gameServerIdRaw : null;
  const paymentMethod = methodStr as PaymentMethod;

  await interaction.deferUpdate();

  // Ambil produk
  const discordUser = interaction.user;
  const products = await getProductsByBrand(
    interaction.message.embeds[0]?.fields.find((f) => f.name === "Game")?.value ?? "",
  );
  const product = products.find((p: Product) => p.itemCode === itemCode);

  if (product === undefined || userId === undefined) {
    await interaction.editReply({ content: "😅 Produk tidak ditemukan.", embeds: [], components: [] });
    return;
  }

  // Cek apakah user mau pakai poin (tidak ada step terpisah di Discord — skip poin di flow ini)
  const finalAmount = product.price;

  // Buat order + invoice
  let order;
  let invoice;
  try {
    order = await createOrder({
      userId,
      game: product.brand,
      gameUserId: gameUserId ?? "",
      ...(gameServerId !== null && { gameServerId }),
      itemCode: product.itemCode,
      itemName: product.itemName,
      amount: finalAmount,
    });

    invoice = await createInvoice({
      merchantOrderId: order.paymentRef!,
      amount: finalAmount,
      itemName: product.itemName,
      customerName: discordUser.username,
      customerEmail: `dc${discordUser.id}@yokmabar.app`,
      paymentMethod,
    });

    await Promise.all([
      setPaymentUrl(order.id, invoice.paymentUrl),
      scheduleOrderExpiry(order.id),
    ]);
  } catch (err) {
    console.error("[discord] createInvoice error:", err);
    await interaction.editReply({
      content: "😅 Ups, ada gangguan sebentar. Coba lagi dalam beberapa menit ya!",
      embeds: [],
      components: [],
    });
    return;
  }

  // Tampilkan tagihan dengan link button
  const payLink = new ButtonBuilder()
    .setLabel("💳 Bayar Sekarang")
    .setURL(invoice.paymentUrl)
    .setStyle(ButtonStyle.Link);

  const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(payLink);

  const tagihanEmbed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("💳 Tagihan YokMabar")
    .addFields(
      { name: "Nominal", value: formatRupiah(finalAmount), inline: true },
      { name: "Order",   value: `#${order.paymentRef}`,    inline: true },
      { name: "Berlaku", value: "15 menit ⏰",             inline: true },
    )
    .setDescription("Selesaikan pembayaran sebelum waktu habis ya!")
    .setTimestamp();

  if (paymentMethod === "QRIS" && invoice.qrString !== undefined) {
    const qrBuffer = await generateQrBuffer(invoice.qrString);
    const attachment = new AttachmentBuilder(qrBuffer, { name: "qris.png" });
    tagihanEmbed.setImage("attachment://qris.png");
    await interaction.editReply({ embeds: [tagihanEmbed], files: [attachment], components: [] });
  } else {
    await interaction.editReply({ embeds: [tagihanEmbed], components: [linkRow] });
  }
}
