import type { Request, Response, NextFunction } from "express";

import logger from "@/config/logger.js";
import { env } from "@/config/config.js";

type HttpError = Error & {
  statusCode?: number;
  status?: number;
};

export const errorHandler = (
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const statusCode = err.statusCode ?? err.status ?? 500;

  logger.error(err.message, {
    statusCode,
    stack: err.stack,
  });

  const isProduction = env.NODE_ENV === "production";
  const responseMessage =
    isProduction && statusCode === 500 ? "Internal Server Error" : err.message;
  res.status(statusCode).json({
    message: responseMessage,
    ...(!isProduction && { stack: err.stack }),
  });
};
