import { z } from "zod";
import { client } from "./contract.ts";

export const DEFAULT_LOOKBACK_DAYS = 60;
export const DAY_MS = 86400000;
export const SESSION_TTL_MS = 30 * 60 * 1000;
export const localSources = ["codex", "claude-code", "antigravity", "cursor", "chatgpt", "other"] as const;
export const scopeOptionsSchema = z.object({
  lookbackDays: z.number().int().min(1).max(365).default(DEFAULT_LOOKBACK_DAYS),
  sourceMode: z.enum(["all_supported_local", "selected"]).default("all_supported_local"),
  sources: z.array(client.exclude(["unknown"])).min(1).max(6).default([...localSources]),
  includeTokscale: z.boolean().default(true),
  installTokscaleIfMissing: z.boolean().default(true),
}).strict().refine(s => new Set(s.sources).size === s.sources.length, "Duplicate scope source");
export type ScopeOptions = z.infer<typeof scopeOptionsSchema>;
export function defaultScopeOptions(): ScopeOptions { return scopeOptionsSchema.parse({}); }
export function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return value.length > 0; } catch { return false; }
}
export const collectorScopeSchema = z.object({
  version: z.literal("1.0"),
  options: scopeOptionsSchema,
  timeZone: z.string().refine(validTimeZone, "Invalid IANA timezone"),
  from: z.string().datetime(),
  to: z.string().datetime(),
}).strict().refine(s => Date.parse(s.to) - Date.parse(s.from) === s.options.lookbackDays * DAY_MS, "Scope must contain the exact rolling interval");
export type CollectorScope = z.infer<typeof collectorScopeSchema>;
export function createCollectorScope(asOf: number, timeZone = "UTC", options: ScopeOptions = defaultScopeOptions()): CollectorScope {
  const parsed = scopeOptionsSchema.parse(options);
  const normalized = { ...parsed, sources: parsed.sourceMode === "all_supported_local" ? [...localSources] : parsed.sources, installTokscaleIfMissing: parsed.includeTokscale && parsed.installTokscaleIfMissing };
  return collectorScopeSchema.parse({ version: "1.0", options: normalized, timeZone, from: new Date(asOf - parsed.lookbackDays * DAY_MS).toISOString(), to: new Date(asOf).toISOString() });
}
export function scopeDate(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return part("year") + "-" + part("month") + "-" + part("day");
}
export function scopeDateBounds(scope: CollectorScope) {
  return { from: scopeDate(scope.from, scope.timeZone), to: scopeDate(new Date(Date.parse(scope.to) - 1).toISOString(), scope.timeZone) };
}
export function withinCollectorScope(timestamp: string | number, scope: CollectorScope) {
  const at = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  return Number.isFinite(at) && at >= Date.parse(scope.from) && at < Date.parse(scope.to);
}
export function formatScopeWindow(scope: CollectorScope, locale: string) {
  const format = new Intl.DateTimeFormat(locale, { timeZone: scope.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" });
  return format.format(new Date(scope.from)) + " → " + format.format(new Date(scope.to)) + " (" + scope.timeZone + ")";
}
