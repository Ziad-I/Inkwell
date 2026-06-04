import { env } from "@/config/config.js";
import { app } from "@/app.js";
import logger from "@/config/logger.js";

app.listen(env.PORT, () => {
  logger.info(`[server]: Server is running at http://localhost:${env.PORT}`);
});
