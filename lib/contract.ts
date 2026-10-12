import { z } from "zod";
import {systemEvidenceSchema,usageEvidenceSchema} from "./usage-level.ts";

export const PROTOCOL_VERSION = "3.0" as const;
export const TURNSTILE_HEADER = "CF-Turnstile-Response";
export const TURNSTILE_ACTION = "create_session";
export const progressSchema = z.object({
  sequence: z.number().int().min(1).max(1000),
  phase: z.enum(["analyzing", "validating", "awaiting_host_approval", "submitting", "paused"]),
  approvalKind: z.enum(["local_read", "network", "command"]).nullable(),
}).strict().refine(p => (p.phase === "awaiting_host_approval") === (p.approvalKind !== null), "Only observed pending host approvals identify a permission kind");
export const typeCodes = ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP", "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"] as const;
export const selfTypeSchema = z.object({ selfType: z.enum(typeCodes).nullable() }).strict();
export const taskAxesSchema = z.object({ EI: z.enum(["E", "I", "unclear"]), SN: z.enum(["S", "N", "unclear"]), TF: z.enum(["T", "F", "unclear"]), JP: z.enum(["J", "P", "unclear"]) }).strict();
const axisId = z.enum(["EI", "SN", "TF", "JP"]);
export const axisResultSchema = z.union([
  z.object({ axis: axisId, value: z.enum(["E", "I", "S", "N", "T", "F", "J", "P"]), strength: z.enum(["clear", "lean"]) }).strict(),
  z.object({ axis: axisId, value: z.literal("?"), strength: z.null() }).strict(),
]);
export const nicknameSchema = z.string().trim().min(1).max(24).regex(/^[\p{L}\p{N}\p{M} _·-]+$/u);
export const createSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), nickname: nicknameSchema,
}).strict();
export const assessmentSchema = z.object({ type: z.enum(typeCodes).nullable(), pattern: z.string().regex(/^[EI?][SN?][TF?][JP?]$/), status: z.enum(["complete", "incomplete"]), axes: z.array(axisResultSchema).length(4) }).strict();
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
export const client = z.enum(["codex", "claude-code", "antigravity", "cursor", "chatgpt", "other", "unknown"]);
const model = z.enum(["openai", "anthropic", "google", "xai", "deepseek", "zai", "other", "unknown"]);
const taskId = z.string().regex(/^T(00[1-9]|01[0-9]|02[0-4])$/);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);

export const submissionSchema = z.object({
  version: z.literal(PROTOCOL_VERSION), kind: z.enum(["fixture", "observed"]), nickname: nicknameSchema,
  consent: z.object({ localAnalysisApproved: z.literal(true), aggregateUploadApproved: z.literal(true) }).strict(),
  observedPeriod: z.object({ from: date, to: date }).strict(),
  coverage: z.object({ scope: z.enum(["adequate", "partial", "insufficient"]), sources: z.array(client).max(7), gaps: z.array(z.enum(["web_history_unavailable", "partial_window", "no_artifact_inspection", "no_tokscale", "unattributed_runs", "insufficient_records", "other_sources_missing"])).max(7), sampledSessions: count }).strict(),
  metrics: z.object({
    humanSessions: count, automatedSessions: count, subagentSessions: count, userMessages: count,
    inputTokens: count, outputTokens: count, tokenSource: z.enum(["tokscale", "authorized_records", "unavailable"]),
    modelUsage: z.array(z.object({ family: model, count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict()).max(8),
    modelUsageUnit: z.enum(["reported_tokens", "sessions", "unknown"]), mostUsedModelFamily: model, mostUsedClient: client,
  }).strict(),
  tasks: z.array(z.object({ id: taskId, date, source: client, context: z.enum(["research", "build", "writing", "planning", "support", "other"]), axes: taskAxesSchema }).strict()).max(24),
  usageEvidence: usageEvidenceSchema.optional(),
  systemEvidence: systemEvidenceSchema.optional(),
}).strict().superRefine((data, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (data.observedPeriod.from > data.observedPeriod.to) issue("Period is reversed");
  const ids = new Set(data.tasks.map((t) => t.id));
  if (ids.size !== data.tasks.length) issue("Task IDs must be unique");
  for (const o of data.usageEvidence?.observations ?? []) {
    if (!ids.has(o.task)) issue("Invalid usage task reference");
  }
  const scanned = data.systemEvidence?.filesScanned ?? null, listed = data.systemEvidence?.filesListed ?? null;
  if (scanned !== null && listed !== null && scanned > listed) issue("System evidence cannot scan more files than it listed");
  // Invariants of collect.py's own counting: a summary that breaks one was edited by hand.
  const system = data.systemEvidence;
  if (system) {
    const perSession = [system.automationSessions, system.assetWriteSessions, system.assetReuseSessions];
    if (scanned !== null && perSession.some((n) => n !== null && n > scanned)) issue("Session counts cannot exceed the files scanned");
    if (scanned === 0 && [...perSession, system.subagentSessions, system.automationSpanDays, system.assetMaintainedAfterAutomation, system.gearKinds].some((n) => n !== null)) issue("Nothing scanned leaves every count unknown");
    if (system.automationSessions === 0 && (system.automationSpanDays !== null || system.assetMaintainedAfterAutomation !== null)) issue("Without automation there is no automation span or upkeep");
    if (system.automationSpanDays !== null && system.automationSpanDays > 366) issue("Automation cannot span more than the window");
  }
  if (data.coverage.sampledSessions !== null && data.tasks.length > data.coverage.sampledSessions) issue("Tasks cannot outnumber the sessions read");
  if (data.tasks.some((t) => !data.coverage.sources.includes(t.source))) issue("Task source is outside observed coverage");
  if (data.tasks.some((t) => t.date < data.observedPeriod.from || t.date > data.observedPeriod.to)) issue("Task date is outside observed period");
  if (new Set(data.coverage.sources).size !== data.coverage.sources.length) issue("Duplicate coverage source");
  if (new Set(data.metrics.modelUsage.map((m) => m.family)).size !== data.metrics.modelUsage.length) issue("Duplicate model family");
  if (data.metrics.tokenSource === "unavailable" && (data.metrics.inputTokens !== null || data.metrics.outputTokens !== null)) issue("Unavailable tokens must stay null");
  if (data.metrics.modelUsageUnit === "unknown" && data.metrics.modelUsage.length) issue("Unknown model usage must stay empty");
  const ranked = [...data.metrics.modelUsage].sort((a, b) => b.count - a.count);
  const top = ranked.length && ranked[0].count > 0 && (ranked.length === 1 || ranked[0].count > ranked[1].count) ? ranked[0].family : "unknown";
  if (data.metrics.mostUsedModelFamily !== top) issue("Model family must match actual aggregates; ties are unknown");
  if (data.metrics.mostUsedClient !== "unknown" && !data.coverage.sources.includes(data.metrics.mostUsedClient)) issue("Client must belong to observed sources");
});
export type Submission = z.infer<typeof submissionSchema>;
export type TypeCode = typeof typeCodes[number];
export type TaskAxes = z.infer<typeof taskAxesSchema>;
export type Axis = keyof TaskAxes;
export type Assessment = z.infer<typeof assessmentSchema>;
export type AxisResult = z.infer<typeof axisResultSchema>;
