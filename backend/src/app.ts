import express, { type Express, type Request, type Response } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";

import { env } from "@/config/config.js";
import { morganMiddleware } from "@/middlewares/morgan.js";
import { errorHandler } from "@/middlewares/errorHandler.js";
import { notFound } from "@/middlewares/notFound.js";

import boardRouter from "@/routers/board.js";

export const app: Express = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(compression());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morganMiddleware);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "OK" });
});

// Routers
const apiRouter = express.Router();
apiRouter.use("/boards", boardRouter);

app.use("/api", apiRouter);

// Global error handler
app.use(notFound);
app.use(errorHandler);
