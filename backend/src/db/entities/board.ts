import { defineEntity, type InferEntity, p } from "@mikro-orm/core";
import { UserSchema } from "@/db/entities/user.js";
import { type DrawPermission, DrawPermissions } from "@/types/types.js";

export const BoardSchema = defineEntity({
  name: "Board",
  properties: {
    id: p.uuid().primary(),
    // owner: p.manyToOne(UserSchema),
    title: p.string().default("Untitled Board"),
    drawPermission: p
      .enum(() => DrawPermissions)
      .default("anyone" as DrawPermission),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
});

export type Board = InferEntity<typeof BoardSchema>;
