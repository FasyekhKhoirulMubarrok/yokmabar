import Redis from "ioredis";
import { config } from "../config.js";

const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

if (config.NODE_ENV !== "production") globalForRedis.redis = redis;
