import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  protocolVersion: text("protocol_version").notNull().default("1.0"),
  readHash: text("read_hash").notNull(),
  writeHash: text("write_hash").notNull(),
  ownerHash: text("owner_hash"),
  nickname: text("nickname").notNull(),
  email: text("email"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  submittedAt: integer("submitted_at"),
  idempotencyKey: text("idempotency_key"),
  payloadHash: text("payload_hash"),
  report: text("report"),
}, (table) => [index("sessions_expiry").on(table.expiresAt)]);
