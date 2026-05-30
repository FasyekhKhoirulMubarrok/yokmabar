import { db } from "../db/client.js";
import { redis } from "../db/redis.js";
import { type Platform } from "@prisma/client";
import { config } from "../config.js";
import { REST, Routes } from "discord.js";
import { stripBrandPrefix } from "../utils/formatter.js";

let _rest: REST | null = null;

function getRest(): REST {
  if (_rest === null) {
    _rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN);
  }
  return _rest;
}

const REVIEW_CHANNEL_KEY = "config:review_channel_id";

export async function getReviewChannelId(): Promise<string | null> {
  const fromRedis = await redis.get(REVIEW_CHANNEL_KEY);
  if (fromRedis !== null) return fromRedis;
  const fromEnv = config.DISCORD_REVIEW_CHANNEL_ID;
  return fromEnv.length > 0 ? fromEnv : null;
}

export async function setReviewChannelId(channelId: string): Promise<void> {
  await redis.set(REVIEW_CHANNEL_KEY, channelId);
}

export async function hasReview(orderId: string): Promise<boolean> {
  const count = await db.review.count({ where: { orderId } });
  return count > 0;
}

export async function saveReview(input: {
  orderId: string;
  userId: string;
  stars: number;
  comment: string | undefined;
  platform: Platform;
}): Promise<void> {
  if (await hasReview(input.orderId)) return;

  await db.review.create({
    data: {
      orderId: input.orderId,
      userId: input.userId,
      stars: input.stars,
      comment: input.comment ?? null,
      platform: input.platform,
    },
  });
}

export async function postReviewToDiscord(input: {
  orderId: string;
  paymentRef: string;
  game: string;
  itemName: string;
  stars: number;
  comment: string | undefined;
  platform: Platform;
  username: string | null;
}): Promise<void> {
  const starDisplay = "⭐".repeat(input.stars) + "☆".repeat(5 - input.stars);
  const userLabel = input.username !== null ? `@${input.username}` : `[${input.platform}]`;
  const itemLabel = stripBrandPrefix(input.game, input.itemName);

  const embed = {
    color: input.stars >= 4 ? 0x34d399 : input.stars >= 3 ? 0xfbbf24 : 0xf87171,
    title: `${starDisplay}  dari ${userLabel}`,
    fields: [
      { name: "Game", value: `${input.game} — ${itemLabel}`, inline: true },
      { name: "Platform", value: input.platform, inline: true },
      { name: "Order", value: `#${input.paymentRef}`, inline: true },
      ...(input.comment !== undefined && input.comment !== ""
        ? [{ name: "Komentar", value: input.comment, inline: false }]
        : []),
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "YokMabar Reviews" },
  };

  const channelId = await getReviewChannelId();
  if (channelId === null) {
    throw new Error("Review channel ID not configured");
  }

  await getRest().post(Routes.channelMessages(channelId), {
    body: { embeds: [embed] },
  });
}
