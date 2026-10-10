import { z } from "zod";
import { client, date, nicknameSchema, progressSchema, submissionSchema, type Submission } from "./contract.ts";
import { validateSubmission } from "./assessment.ts";
import {collectorScopeSchema,scopeDateBounds,type CollectorScope} from "./collector-scope.ts";

export const grantSchema = z.object({
  scopeApproved: z.literal(true), sourceOwnershipConfirmed: z.literal(true),
  origin: z.string().url(), sessionId: z.string().uuid(), expiresAt: z.number().int(), nickname: nicknameSchema,
  sources: z.array(client).max(7), period: z.object({ from: date, to: date }).strict(),
  collectionScope: collectorScopeSchema.optional(),
}).strict();
export type CollectorGrant = z.infer<typeof grantSchema>;
export type CollectorTarget = { origin: string; id: string; writeToken: string; expiresAt: number; nickname: string };
type Transport = { fetcher?: typeof fetch; now?: () => number; wait?: (ms: number) => Promise<void> };
type Outcome = { status: "accepted"; duplicate: boolean } | { status: "expired" | "conflict" | "blocked" | "unavailable" | "invalid" } | { status: "approval_required"; kind: "local_read" | "network" | "command" };
export class HostApprovalRequired extends Error {
  kind: "local_read" | "network" | "command";
  constructor(kind: "local_read" | "network" | "command") { super("Host approval is pending"); this.kind = kind; }
}
function validateTarget(input: CollectorGrant, target: CollectorTarget) {
  const grant = grantSchema.parse(input);
  const url = new URL(target.origin);
  const local = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.origin !== target.origin || url.username || url.password) throw new Error("Invalid destination");
  if (grant.origin !== target.origin || grant.sessionId !== target.id || grant.expiresAt !== target.expiresAt || grant.nickname !== target.nickname || !/^[0-9a-f]{64}$/.test(target.writeToken)) throw new Error("A new destination requires an explicit new grant");
  if (grant.period.from > grant.period.to || new Set(grant.sources).size !== grant.sources.length) throw new Error("Invalid approved scope");
  if(grant.collectionScope){
    const dates=scopeDateBounds(grant.collectionScope);
    if(grant.period.from!==dates.from||grant.period.to!==dates.to||grant.sources.some(s=>!grant.collectionScope!.options.sources.includes(s as Exclude<typeof s,"unknown">)))throw new Error("Grant differs from the populated scope");
  }
  return grant;
}
export function grantPopulatedScope(scope:CollectorScope,target:CollectorTarget,approval:{scopeApproved:true;sourceOwnershipConfirmed:true}):CollectorGrant{
  return grantSchema.parse({...approval,origin:target.origin,sessionId:target.id,expiresAt:target.expiresAt,nickname:target.nickname,sources:scope.options.sources,period:scopeDateBounds(scope),collectionScope:scope});
}
export function prepareAuthorizedSummary(input: unknown, grant: CollectorGrant, target: CollectorTarget, now = Date.now()): Submission {
  validateTarget(grant, target);
  const shape = submissionSchema.parse(input);
  const data = validateSubmission(shape, now);
  if (data.nickname !== grant.nickname || data.observedPeriod.from < grant.period.from || data.observedPeriod.to > grant.period.to || data.coverage.sources.some(s => !grant.sources.includes(s))) throw new Error("Summary exceeds approved scope");
  if(grant.collectionScope&&!grant.collectionScope.options.includeTokscale&&data.metrics.tokenSource==="tokscale")throw new Error("Tokscale was excluded from this scope");
  return data;
}
async function send(path: string, body: string, target: CollectorTarget, extra: Record<string, string>, transport: Transport): Promise<Outcome> {
  const fetcher = transport.fetcher ?? fetch;
  const now = transport.now ?? Date.now;
  const wait = transport.wait ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < 3; attempt++) {
    if (now() >= target.expiresAt) return { status: "expired" };
    try {
      const response = await fetcher(target.origin + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + target.writeToken, ...extra }, body, redirect: "error", signal: AbortSignal.timeout(8000) });
      if (response.status === 410 || response.status === 404) return { status: "expired" };
      if (response.status === 409) return { status: "conflict" };
      if ([401,403].includes(response.status)) return { status: "blocked" };
      if ([400,413,415,422].includes(response.status)) return { status: "invalid" };
      if (response.ok) { const ack = z.object({ accepted: z.literal(true), duplicate: z.boolean().optional() }).parse(await response.json()); return { status: "accepted", duplicate: ack.duplicate === true }; }
      if (response.status !== 503) return { status: "unavailable" };
    } catch (error) {
      if (error instanceof HostApprovalRequired) return { status: "approval_required", kind: error.kind };
    }
    if (attempt < 2) await wait((attempt + 1) * 1000);
  }
  return { status: "unavailable" };
}
export async function reportCollectorProgress(grant: CollectorGrant, target: CollectorTarget, progress: z.infer<typeof progressSchema>, transport: Transport = {}): Promise<Outcome> {
  validateTarget(grant, target);
  return send("/api/collect/" + target.id + "/status", JSON.stringify(progressSchema.parse(progress)), target, {}, transport);
}
export async function submitAuthorizedSummary(input: unknown, grant: CollectorGrant, target: CollectorTarget, idempotencyKey: string, transport: Transport = {}): Promise<Outcome> {
  const data = prepareAuthorizedSummary(input, grant, target, (transport.now ?? Date.now)());
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) throw new Error("Invalid retry key");
  return send("/api/collect/" + target.id, JSON.stringify(data), target, { "Idempotency-Key": idempotencyKey }, transport);
}
