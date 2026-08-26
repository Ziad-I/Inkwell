import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  check,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { type BoardState } from "@/types/types.js";

export const boardRoleEnum = pgEnum("board_role", [
  "owner",
  "editor",
  "viewer",
]);

export const users = pgTable("user", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text("username").unique().notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const boards = pgTable(
  "board",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull().default("Untitled Board"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    defaultRole: boardRoleEnum("default_role").notNull().default("editor"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
    // NULL = active; set = archived (hidden from dashboards, still reachable).
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    check("board_default_role_not_owner", sql`${table.defaultRole} != 'owner'`),
  ],
);

export const refreshTokens = pgTable("refresh_token", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }).notNull(),
  revokedAt: timestamp("revoked_at", {
    withTimezone: true,
  }),
  rotationGraceExpiresAt: timestamp("rotation_grace_expires_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const boardInvites = pgTable(
  "board_invite",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    role: boardRoleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    // NULL = unlimited uses.
    maxUses: integer("max_uses"),
    useCount: integer("use_count").notNull().default(0),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
    }),
  },
  (table) => [
    check("board_invite_role_not_owner", sql`${table.role} != 'owner'`),
    check("board_invite_use_count_non_negative", sql`${table.useCount} >= 0`),
    check(
      "board_invite_max_uses_positive",
      sql`${table.maxUses} IS NULL OR ${table.maxUses} > 0`,
    ),
    index("board_invite_board_id_idx").on(table.boardId),
  ],
);

export const snapshots = pgTable(
  "snapshot",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    state: jsonb("state").notNull().$type<BoardState>(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("snapshot_board_id_idx").on(table.boardId)],
);

export type User = typeof users.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type BoardInvite = typeof boardInvites.$inferSelect;
