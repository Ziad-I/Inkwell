import { env } from "@/config/config.js";
import path from "node:path";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
    silly: 5,
  },
  colors: {
    error: "red",
    warn: "yellow",
    info: "green",
    http: "magenta",
    debug: "blue",
    silly: "cyan",
  },
};

winston.addColors(customLevels.colors);

const isDevelopment = env.NODE_ENV === "development";

const logger = winston.createLogger({
  levels: customLevels.levels,

  level: env.LOG_LEVEL ?? (isDevelopment ? "debug" : "info"),

  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.json(),
  ),

  defaultMeta: {
    service: env.APP_NAME ?? "express-api",
  },

  transports: [
    new DailyRotateFile({
      filename: path.join("logs", "combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d",
      zippedArchive: true,
    }),

    new DailyRotateFile({
      filename: path.join("logs", "error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxSize: "20m",
      maxFiles: "30d",
      zippedArchive: true,
    }),
  ],

  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join("logs", "exceptions.log"),
    }),
  ],

  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join("logs", "rejections.log"),
    }),
  ],
});

logger.add(
  new winston.transports.Console({
    format: isDevelopment
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({
            format: "HH:mm:ss",
          }),
          winston.format.printf(
            ({ timestamp, level, message, stack }) =>
              `${timestamp} ${level}: ${stack ?? message}`,
          ),
        )
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
  }),
);

export default logger;
