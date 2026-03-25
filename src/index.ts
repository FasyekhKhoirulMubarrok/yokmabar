import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { db } from "./db/client.js";
import { redis } from "./db/redis.js";
import app from "./api/index.js";

// ─── Bot imports ──────────────────────────────────────────────────────────────

import { startTelegramBot, stopTelegramBot } from "./bots/telegram/index.js";
import { startDiscordBot, stopDiscordBot } from "./bots/discord/index.js";
import whatsappRouter from "./bots/whatsapp/index.js";

// ─── Worker imports ───────────────────────────────────────────────────────────

import { orderWorker, closeOrderWorker } from "./jobs/order.worker.js";
import { expireWorker, closeExpireWorker } from "./jobs/expire.worker.js";
import { syncWorker, registerSyncSchedules, closeSyncWorker } from "./jobs/sync.worker.js";
import {
  balanceWorker,
  registerBalanceSchedule,
  closeBalanceWorker,
} from "./jobs/balance.worker.js";
import { closeQueues } from "./jobs/queue.js";

// ─── Mount WhatsApp router ────────────────────────────────────────────────────

app.route("/webhook/whatsapp", whatsappRouter);

// ─── Graceful shutdown ────────────────────────────────────────────────────────

let isShuttingDown = false;
let httpServer: ReturnType<typeof serve> | null = null;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[shutdown] Received ${signal} — starting graceful shutdown...`);

  // Tutup HTTP server PERTAMA agar port langsung dilepas
  await new Promise<void>((resolve) => {
    if (httpServer === null) { resolve(); return; }
    httpServer.close(() => resolve());
  });

  // Timeout 5 detik untuk seluruh shutdown — paksa exit jika terlalu lama
  const forceExit = setTimeout(() => {
    logger.warn("[shutdown] Force exit after timeout.");
    process.exit(0);
  }, 5_000);

  try {
    await Promise.all([
      closeOrderWorker(),
      closeExpireWorker(),
      closeSyncWorker(),
      closeBalanceWorker(),
    ]);
    await closeQueues();
    await Promise.all([stopTelegramBot(), stopDiscordBot()]);
    await Promise.all([db.$disconnect(), redis.quit()]);

    clearTimeout(forceExit);
    logger.info("[shutdown] Graceful shutdown complete.");
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExit);
    logger.error("[shutdown] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT",  () => void shutdown("SIGINT"));

// ─── Startup ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info(`[startup] ${config.APP_NAME} starting (${config.NODE_ENV})...`);

  // Workers — log untuk konfirmasi aktif
  logger.info(`[startup] Order worker: ${orderWorker.isRunning() ? "running" : "idle"}`);
  logger.info(`[startup] Expire worker: ${expireWorker.isRunning() ? "running" : "idle"}`);
  logger.info(`[startup] Sync worker: ${syncWorker.isRunning() ? "running" : "idle"}`);
  logger.info(`[startup] Balance worker: ${balanceWorker.isRunning() ? "running" : "idle"}`);

  // Register scheduled jobs (BullMQ repeat)
  await registerSyncSchedules();
  logger.info("[startup] Sync schedules registered.");

  await registerBalanceSchedule();
  logger.info("[startup] Balance schedule registered.");

  // Bots
  try {
    await startDiscordBot();
    logger.info("[startup] Discord bot connected.");
  } catch (err) {
    logger.error("[startup] Discord bot failed to start:", err);
  }

  try {
    await startTelegramBot();
    logger.info("[startup] Telegram bot started (long polling).");
  } catch (err) {
    logger.error("[startup] Telegram bot failed to start:", err);
  }

  // HTTP server
  httpServer = serve(
    { fetch: app.fetch, port: config.PORT },
    (info) => {
      logger.info(`[startup] HTTP server listening on port ${info.port}`);
      logger.info(`[startup] All services running — ${config.APP_NAME} ready! 🚀`);
    },
  );

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.error(`[startup] Port ${config.PORT} sudah dipakai. Jalankan: taskkill /F /IM node.exe lalu coba lagi.`);
    } else {
      logger.error("[startup] HTTP server error:", err);
    }
    process.exit(1);
  });
}

main().catch((err: unknown) => {
  logger.error("[startup] Fatal error:", err);
  process.exit(1);
});
