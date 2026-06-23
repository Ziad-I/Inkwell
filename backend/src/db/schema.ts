import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
} from "drizzle-orm/pg-core";
import { DrawPermissions, type BoardState } from "@/types/types.js";

export const drawPermissionEnum = pgEnum("draw_permission", DrawPermissions);

export const users = pgTable("user", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text("username").unique().notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const boards = pgTable("board", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull().default("Untitled Board"),
  ownerId: text("owner_id").notNull(),
  drawPermission: drawPermissionEnum("draw_permission")
    .notNull()
    .default("anyone"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const snapshots = pgTable("snapshot", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  boardId: uuid("board_id")
    .notNull()
    .references(() => boards.id),
  state: jsonb("state").notNull().$type<BoardState>(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
