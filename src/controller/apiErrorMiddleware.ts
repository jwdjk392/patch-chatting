import type { ErrorRequestHandler } from "express";
import { AppError } from "@lib/error";
import { logger } from "@lib/logger";


export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req,
  res,
  next,
) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  logger.error(err);

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
};
