import { z } from "zod";

export const nicknameSchema = z.string().trim().min(1).max(24).regex(/^[\p{L}\p{N}\p{M} _·-]+$/u);
export const createSchema = z.object({
  nickname: nicknameSchema,
  email: z.string().trim().email().max(254).optional(),
  emailResultOnlyConsent: z.boolean().optional(),
}).strict().refine((p) => !p.email || p.emailResultOnlyConsent === true, "Email requires result-only consent");
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
const client = z.enum(["codex", "claude-code", "antigravity", "cursor", "chatgpt", "other", "unknown"]);
const model = z.enum(["openai", "anthropic", "google", "xai", "deepseek", "zai", "other", "unknown"]);
const caseId = z.string().regex(/^E(00[1-9]|01[0-9]|02[0-4])$/);
const refs = z.array(caseId).max(24);
const signal = z.object({ status: z.enum(["observed", "contradicted", "unknown"]), cases: refs }).strict().refine((s) => s.status === "unknown" ? s.cases.length === 0 : s.cases.length > 0, "Signal requires local case references");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
export const signalNames = ["unsafeAdoption", "iterativeRetry", "stableSingleTask", "preciseInstruction", "effectiveCorrection", "reusableArtifact", "testedBeforeUse", "repeatedUse", "handoffReady", "selfTestCases", "rolesAndCriteria", "exceptionHandling", "maintenanceFeedback", "sharedRulesActualUse"] as const;
const signalsShape = Object.fromEntries(signalNames.map((name) => [name, signal])) as Record<typeof signalNames[number], typeof signal>;
const axis = <T extends [string, string, string]>(values: T) => z.object({ value: z.enum(values), cases: refs }).strict().refine((s) => s.value === "?" ? s.cases.length === 0 : s.cases.length > 0, "Known axes require evidence");

export const submissionSchema = z.object({
  version: z.literal("1.0"), kind: z.enum(["fixture", "observed"]), nickname: nicknameSchema,
  consent: z.object({ localAnalysisApproved: z.literal(true), aggregateUploadApproved: z.literal(true) }).strict(),
  observedPeriod: z.object({ from: date, to: date }).strict(),
  coverage: z.object({ scope: z.enum(["adequate", "partial", "insufficient"]), sources: z.array(client).max(7), gaps: z.array(z.enum(["web_history_unavailable", "partial_window", "no_artifact_inspection", "no_tokscale", "unattributed_runs", "insufficient_records", "other_sources_missing"])).max(7), sampledSessions: count }).strict(),
  metrics: z.object({
    humanSessions: count, automatedSessions: count, subagentSessions: count, userMessages: count,
    inputTokens: count, outputTokens: count, tokenSource: z.enum(["tokscale", "authorized_records", "unavailable"]),
    modelUsage: z.array(z.object({ family: model, count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict()).max(8),
    modelUsageUnit: z.enum(["reported_tokens", "sessions", "unknown"]), mostUsedModelFamily: model, mostUsedClient: client,
  }).strict(),
  cases: z.array(z.object({ id: caseId, source: client, kind: z.enum(["conversation", "artifact_test", "reuse", "system_run", "maintenance"]) }).strict()).max(24),
  signals: z.object(signalsShape).strict(),
  workflows: z.object({ independentWorkflows: count, independentRuns: count, sustainedDays: count, cloudDependent: z.boolean().nullable(), entrypoints: z.array(client).max(7) }).strict(),
  axes: z.object({ preparation: axis(["P", "Q", "?"]), verification: axis(["V", "A", "?"]), reuse: axis(["S", "O", "?"]), execution: axis(["E", "C", "?"]) }).strict(),
  assessment: z.object({ level: z.enum(["unknown", "LV0", "LV1", "LV2", "LV3", "LV4", "LV4+", "LV5"]), type: z.string().regex(/^[PQ?][VA?][SO?][EC?]$/) }).strict(),
}).strict().superRefine((data, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (data.observedPeriod.from > data.observedPeriod.to) issue("Period is reversed");
  const ids = new Set(data.cases.map((c) => c.id));
  if (ids.size !== data.cases.length) issue("Case IDs must be unique");
  for (const s of [...Object.values(data.signals), ...Object.values(data.axes)]) {
    if (new Set(s.cases).size !== s.cases.length || s.cases.some((id) => !ids.has(id))) issue("Invalid case reference");
  }
  if (data.cases.some((c) => !data.coverage.sources.includes(c.source))) issue("Case source is outside observed coverage");
  if (new Set(data.metrics.modelUsage.map((m) => m.family)).size !== data.metrics.modelUsage.length) issue("Duplicate model family");
  if (data.metrics.tokenSource === "unavailable" && (data.metrics.inputTokens !== null || data.metrics.outputTokens !== null)) issue("Unavailable tokens must stay null");
  if (data.metrics.modelUsageUnit === "unknown" && data.metrics.modelUsage.length) issue("Unknown model usage must stay empty");
  const ranked = [...data.metrics.modelUsage].sort((a, b) => b.count - a.count);
  const top = ranked.length && ranked[0].count > 0 && (ranked.length === 1 || ranked[0].count > ranked[1].count) ? ranked[0].family : "unknown";
  if (data.metrics.mostUsedModelFamily !== top) issue("Model family must match actual aggregates; ties are unknown");
  if (data.metrics.mostUsedClient !== "unknown" && !data.coverage.sources.includes(data.metrics.mostUsedClient)) issue("Client must belong to observed sources");
  const span = (Date.parse(data.observedPeriod.to) - Date.parse(data.observedPeriod.from)) / 86400000 + 1;
  if (data.workflows.sustainedDays !== null && data.workflows.sustainedDays > span) issue("Sustained days exceed observed period");
  if (data.workflows.entrypoints.some((c) => !data.coverage.sources.includes(c))) issue("Entrypoints must be observed sources");
});
export type Submission = z.infer<typeof submissionSchema>;
export type Level = Submission["assessment"]["level"];
