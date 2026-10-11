import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  protocolVersion: text("protocol_version").notNull().default("1.0"),
  progressPhase: text("progress_phase").notNull().default("not_connected"),
  progressSequence: integer("progress_sequence").notNull().default(0),
  progressAt: integer("progress_at"),
  approvalKind: text("approval_kind"),
  readHash: text("read_hash").notNull(),
  writeHash: text("write_hash").notNull(),
  nickname: text("nickname").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  submittedAt: integer("submitted_at"),
  idempotencyKey: text("idempotency_key"),
  payloadHash: text("payload_hash"),
  report: text("report"),
  selfType: text("self_type"),
}, (table) => [index("sessions_expiry").on(table.expiresAt)]);

export const rememberedResults=sqliteTable('remembered_results',{
 id:text('id').primaryKey(),tokenHash:text('token_hash').notNull(),expiresAt:integer('expires_at').notNull(),report:text('report').notNull(),selfType:text('self_type'),
},table=>[index('remembered_expiry').on(table.expiresAt)]);
