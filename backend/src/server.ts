import { env } from "@/config/config.js";
import { app } from "@/app.js";
import logger from "@/config/logger.js";
import { createSocketServer } from "@/socket/server.js";
import { connectRedis, disconnectRedis } from "./redis/client.js";
import { RequestContext } from "@mikro-orm/core";
import { connectDB, disconnectDB } from "@/db/index.js";

async function startServer() {
  try {
    await connectRedis();
    const db = await connectDB();

    app.use((req, res, next) => RequestContext.create(db.em, next));

    const { io, httpServer } = createSocketServer(app);

    httpServer.listen(env.PORT, () => {
      logger.info(
        `[server]: Server is running at http://localhost:${env.PORT}`,
      );
    });

    const gracefulShutdown = async () => {
      logger.info("[server]: Shutting down server...");
      io.close();
      httpServer.close(async () => {
        await disconnectRedis();
        await disconnectDB();
        logger.info("[server]: Server shutdown complete.");
        process.exit(0); // Exit the process with a success code
      });
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);
  } catch (error) {
    logger.error(`[server]: Failed to start server - ${error}`);
    process.exit(1); // Exit the process with an error code
  }
}

void startServer();
