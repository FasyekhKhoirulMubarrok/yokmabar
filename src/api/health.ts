import { Hono } from "hono";
import { db } from "../db/client.js";
import { redis } from "../db/redis.js";
import { config } from "../config.js";

const health = new Hono();

health.get("/", async (c) => {
  const checks = await Promise.allSettled([
    db.$queryRaw`SELECT 1`,
    redis.ping(),
  ]);

  const dbOk = checks[0].status === "fulfilled";
  const redisOk = checks[1].status === "fulfilled";
  const healthy = dbOk && redisOk;

  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      app: config.APP_NAME,
      env: config.NODE_ENV,
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk ? "ok" : "error",
        redis: redisOk ? "ok" : "error",
      },
    },
    healthy ? 200 : 503,
  );
});

export default health;
