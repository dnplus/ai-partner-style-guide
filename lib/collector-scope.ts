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

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wallParts(instant: number, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const read = (type: string) => Number(parts.find(part => part.type === type)!.value);
  const wall = { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
  if (wall.hour === 24) {
    const next = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1));
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate(), hour: 0, minute: wall.minute, second: wall.second };
  }
  return wall;
}

function shiftDate(year: number, month: number, day: number, delta: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function utcFromWall(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const seen = wallParts(utc, timeZone);
    const rendered = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    const next = utc + (target - rendered);
    if (next === utc) return utc;
    utc = next;
  }
  return utc;
}

export function localWindowStart(asOf: number, timeZone: string, lookbackDays: number) {
  const today = wallParts(asOf, timeZone);
  const start = shiftDate(today.year, today.month, today.day, -(lookbackDays - 1));
  return new Date(utcFromWall(start.year, start.month, start.day, 0, 0, 0, timeZone)).toISOString();
}

export function scopeDate(instant: string, timeZone: string) {
  const wall = wallParts(Date.parse(instant), timeZone);
  return String(wall.year).padStart(4, "0") + "-" + String(wall.month).padStart(2, "0") + "-" + String(wall.day).padStart(2, "0");
}

export function scopeDateBounds(scope: { from: string; to: string; timeZone: string }) {
  return { from: scopeDate(scope.from, scope.timeZone), to: scopeDate(new Date(Date.parse(scope.to) - 1).toISOString(), scope.timeZone) };
}

function wholeLocalDays(scope: { from: string; to: string; timeZone: string; options: { lookbackDays: number } }) {
  const start = Date.parse(scope.from);
  const stop = Date.parse(scope.to);
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start >= stop) return false;
  const wall = wallParts(start, scope.timeZone);
  if (wall.hour !== 0 || wall.minute !== 0 || wall.second !== 0) return false;
  const today = wallParts(stop, scope.timeZone);
  const expected = shiftDate(today.year, today.month, today.day, -(scope.options.lookbackDays - 1));
  return wall.year === expected.year && wall.month === expected.month && wall.day === expected.day;
}

export const collectorScopeSchema = z.object({
  version: z.literal("1.0"),
  options: scopeOptionsSchema,
  timeZone: z.string().refine(validTimeZone, "Invalid IANA timezone"),
  from: z.string().datetime(),
  to: z.string().datetime(),
}).strict().refine(wholeLocalDays, "Scope must start at local midnight and cover the lookback in local days");
export type CollectorScope = z.infer<typeof collectorScopeSchema>;
export function createCollectorScope(asOf: number, timeZone = "UTC", options: ScopeOptions = defaultScopeOptions()): CollectorScope {
  const parsed = scopeOptionsSchema.parse(options);
  const normalized = { ...parsed, sources: parsed.sourceMode === "all_supported_local" ? [...localSources] : parsed.sources, installTokscaleIfMissing: parsed.includeTokscale && parsed.installTokscaleIfMissing };
  return collectorScopeSchema.parse({ version: "1.0", options: normalized, timeZone, from: localWindowStart(asOf, timeZone, parsed.lookbackDays), to: new Date(asOf).toISOString() });
}
export function withinCollectorScope(timestamp: string | number, scope: CollectorScope) {
  const at = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  return Number.isFinite(at) && at >= Date.parse(scope.from) && at < Date.parse(scope.to);
}
export function formatScopeWindow(scope: CollectorScope, locale: string) {
  const bounds = scopeDateBounds(scope);
  const end = new Intl.DateTimeFormat(locale, { timeZone: scope.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" }).format(new Date(scope.to));
  return bounds.from + " → " + bounds.to + " " + end + " (" + scope.timeZone + ")";
}
