import {
  EntityManager,
  EntityRepository,
  MikroORM,
} from "@mikro-orm/postgresql";
import mikroOrmConfig from "@/db/mikro-orm.config.js";
import logger from "@/config/logger.js";
import { UserSchema, type User } from "@/db/entities/user.js";
import { BoardSchema, type Board } from "@/db/entities/board.js";
import { SnapshotSchema, type Snapshot } from "@/db/entities/snapshot.js";

export const db = {} as {
  orm: MikroORM;
  em: EntityManager;
  users: EntityRepository<User>;
  boards: EntityRepository<Board>;
  snapshots: EntityRepository<Snapshot>;
};

export async function connectDB() {
  try {
    const orm = await MikroORM.init(mikroOrmConfig);
    db.orm = orm;
    db.em = orm.em;
    db.users = orm.em.getRepository(UserSchema.name);
    db.boards = orm.em.getRepository(BoardSchema.name);
    db.snapshots = orm.em.getRepository(SnapshotSchema.name);
    logger.info("[db]: Database connected successfully.");
    return db;
  } catch (error) {
    logger.error(`[db]: Failed to connect to the database - ${error}`);
    throw error;
  }
}

export async function disconnectDB() {
  if (db.orm) {
    try {
      await db.orm.close(true);
      logger.info("[db]: Database connection closed successfully.");
    } catch (error) {
      logger.error(`[db]: Failed to close the database connection - ${error}`);
    }
  }
}
