import type { Request, Response } from "express";

export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({
    message: "Not Found",
  });
};
