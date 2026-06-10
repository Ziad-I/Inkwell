import { defineEntity, type InferEntity, p } from "@mikro-orm/core";

export const UserSchema = defineEntity({
  name: "User",
  properties: {
    id: p.uuid().primary(),
    username: p.string().unique(),
    email: p.string().unique(),
    passwordHash: p.string(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export type User = InferEntity<typeof UserSchema>;
