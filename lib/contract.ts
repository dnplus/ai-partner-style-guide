import { z } from "zod";

export const PROTOCOL_VERSION = "2.0" as const;
export const typeCodes = ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP", "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"] as const;
export const behaviorCodes = ["collaborative_iteration", "consolidated_delivery", "concrete_evidence", "pattern_exploration", "consistent_criteria", "people_context", "early_commitment", "reversible_experiments"] as const;
export const behaviorAxis = { collaborative_iteration: "EI", consolidated_delivery: "EI", concrete_evidence: "SN", pattern_exploration: "SN", consistent_criteria: "TF", people_context: "TF", early_commitment: "JP", reversible_experiments: "JP" } as const;
export const nicknameSchema = z.string().trim().min(1).max(24).regex(/^[\p{L}\p{N}\p{M} _·-]+$/u);
export const createSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION), nickname: nicknameSchema,
  email: z.string().trim().email().max(254).optional(), emailResultOnlyConsent: z.boolean().optional(),
}).strict().refine((p) => !p.email || p.emailResultOnlyConsent === true, "Email requires result-only consent");
export const assessmentSchema = z.object({ type: z.enum(typeCodes).nullable(), pattern: z.string().regex(/^[EI?][SN?][TF?][JP?]$/), status: z.enum(["complete", "incomplete"]) }).strict();
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
const client = z.enum(["codex", "claude-code", "antigravity", "cursor", "chatgpt", "other", "unknown"]);
const model = z.enum(["openai", "anthropic", "google", "xai", "deepseek", "zai", "other", "unknown"]);
const taskId = z.string().regex(/^T(00[1-9]|01[0-9]|02[0-4])$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);

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
  tasks: z.array(z.object({ id: taskId, date, source: client, context: z.enum(["research", "build", "writing", "planning", "support", "other"]) }).strict()).max(24),
  observations: z.array(z.object({
    id: z.string().regex(/^O(00[1-9]|0[1-3][0-9]|04[0-8])$/), task: taskId,
    behavior: z.enum(behaviorCodes), ownerRequest: z.enum([...behaviorCodes, "not_specified", "unknown"]),
    opportunity: z.enum(["both_available", "constrained", "unclear"]),
  }).strict()).max(48),
  assessment: assessmentSchema,
}).strict().superRefine((data, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (data.observedPeriod.from > data.observedPeriod.to) issue("Period is reversed");
  const ids = new Set(data.tasks.map((t) => t.id));
  if (ids.size !== data.tasks.length) issue("Task IDs must be unique");
  if (new Set(data.observations.map((o) => o.id)).size !== data.observations.length) issue("Observation IDs must be unique");
  for (const o of data.observations) {
    if (!ids.has(o.task)) issue("Invalid task reference");
    if (o.ownerRequest !== "not_specified" && o.ownerRequest !== "unknown" && behaviorAxis[o.ownerRequest] !== behaviorAxis[o.behavior]) issue("Owner request must describe the same axis as the observed behavior");
  }
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
export type Behavior = typeof behaviorCodes[number];
