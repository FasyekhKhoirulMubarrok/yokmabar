import { createLogger, format, transports } from "winston";
import { config } from "../config.js";

// ─── Logger ───────────────────────────────────────────────────────────────────

const productionFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.errors({ stack: true }),
  format.splat(),
  format.json(),
);

const developmentFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: "HH:mm:ss" }),
  format.errors({ stack: true }),
  format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    const body = (stack as string | undefined) ?? (message as string);
    return `${timestamp as string} ${level}: ${body}${metaStr}`;
  }),
);

export const logger = createLogger({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  defaultMeta: { service: "yokmabar" },
  format: productionFormat,
  transports: [
    new transports.File({
      filename: "logs/error.log",
      level: "error",
      format: productionFormat,
    }),
    new transports.File({
      filename: "logs/combined.log",
      format: productionFormat,
    }),
  ],
});

if (config.NODE_ENV !== "production") {
  logger.add(
    new transports.Console({
      format: developmentFormat,
    }),
  );
} else {
  logger.add(
    new transports.Console({
      format: productionFormat,
    }),
  );
}
