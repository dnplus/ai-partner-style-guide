import copy from "./collector-copy.json" with { type: "json" };
import type { Locale } from "./i18n.ts";
import { COLLECTOR_SCRIPT_SHA256 } from "./collector-script-hash.ts";
import { createCollectorScope, formatScopeWindow, SESSION_TTL_MS, collectorScopeSchema, type CollectorScope } from "./collector-scope.ts";

export type LocalSession = { id: string; readToken: string; writeToken?: string; expiresAt: number; nickname: string };

export function collectorConfirmation(scope: CollectorScope, locale: Locale = "zh-TW") {
  const text = copy[locale];
  const sources = scope.options.sourceMode === "all_supported_local"
    ? text.allSources
    : text.selectedSources.replace("{sources}", scope.options.sources.join(", "));
  const tokscale = scope.options.includeTokscale
    ? (scope.options.installTokscaleIfMissing ? text.tokscaleInstall : text.tokscaleExisting)
    : text.tokscaleDisabled;
  const params: Record<string, string> = {
    sources,
    days: String(scope.options.lookbackDays),
    window: formatScopeWindow(scope, locale),
    tokscale,
  };
  return text.confirmation.replace(/\{(sources|days|window|tokscale)\}/g, (_, key: string) => params[key]);
}

function tokscaleMode(scope: CollectorScope) {
  if (!scope.options.includeTokscale) return "off";
  return scope.options.installTokscaleIfMissing ? "install" : "existing";
}

export function collectorInstructions(session: LocalSession, origin: string, resume = false, locale: Locale = "zh-TW", inputScope?: CollectorScope) {
  const text = copy[locale];
  const scope = collectorScopeSchema.parse(inputScope ?? createCollectorScope(session.expiresAt - SESSION_TTL_MS));
  const params: Record<string, string> = {
    origin,
    id: session.id,
    nickname: session.nickname,
    expires: new Date(session.expiresAt).toISOString(),
    token: session.writeToken ?? "[WRITE_TOKEN_UNAVAILABLE]",
    from: scope.from,
    to: scope.to,
    timeZone: scope.timeZone,
    sources: scope.options.sources.join(","),
    tokscaleMode: tokscaleMode(scope),
    scriptHash: COLLECTOR_SCRIPT_SHA256,
  };
  const fill = (line: string) => line.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) => params[key] ?? match);
  const lines = [text.intro, text.destination, text.token, text.scope, text.read].map(fill);
  if (resume) lines.push(fill(text.renew));
  lines.push(collectorConfirmation(scope, locale));
  return lines.join("\n");
}
