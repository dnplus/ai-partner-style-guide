import { TURNSTILE_ACTION, TURNSTILE_HEADER } from "./contract.ts";
import { json } from "./session-service.ts";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type CreateEnv = Pick<Env, "SESSION_CREATE_LIMITER" | "TURNSTILE_SECRET_KEY">;
type WriteEnv = Pick<Env, "WRITE_LIMITER">;
type Siteverify = { success?: boolean; action?: string; hostname?: string; metadata?: { result_with_testing_key?: boolean } };

const clientIp = (request: Request) => request.headers.get("CF-Connecting-IP");

async function limited(limiter: RateLimit, request: Request) {
  const { success } = await limiter.limit({ key: clientIp(request) ?? "unknown" });
  if (success) return null;
  const response = json({ error: "嘗試太頻繁了，請稍候一分鐘再試。", code: "rate_limited" }, 429);
  response.headers.set("Retry-After", "60");
  return response;
}

// Runs before session creation: per-IP limit first, so failed challenges also count, then Turnstile.
export async function guardCreate(env: CreateEnv, request: Request, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const throttled = await limited(env.SESSION_CREATE_LIMITER, request);
  if (throttled) return throttled;
  const rejected = json({ error: "人機驗證未通過，請重新驗證後再試。", code: "turnstile_failed" }, 403);
  const unavailable = json({ error: "人機驗證暫時無法使用，請稍後再試。", code: "turnstile_unavailable" }, 503);
  const token = request.headers.get(TURNSTILE_HEADER);
  if (!token || token.length > 2048) return rejected;
  if (!env.TURNSTILE_SECRET_KEY) return unavailable;
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  const ip = clientIp(request);
  if (ip) form.set("remoteip", ip);
  let result: Siteverify;
  try {
    const response = await fetcher(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return unavailable;
    result = await response.json();
  } catch {
    return unavailable;
  }
  if (result.success !== true) return rejected;
  // Test secrets answer for example.com without an action; real widgets must match this surface and host.
  if (result.metadata?.result_with_testing_key === true) return null;
  return result.action === TURNSTILE_ACTION && result.hostname === new URL(request.url).hostname ? null : rejected;
}

export async function guardWrite(env: WriteEnv, request: Request): Promise<Response | null> {
  return limited(env.WRITE_LIMITER, request);
}
