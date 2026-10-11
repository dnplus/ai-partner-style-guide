import test from "node:test";
import assert from "node:assert/strict";
import { guardCreate, guardWrite } from "../lib/abuse-guard.ts";
import { TURNSTILE_ACTION, TURNSTILE_HEADER } from "../lib/contract.ts";

const origin = "https://agent-mbti.example.workers.dev";
function limiter(allow: boolean) {
  const keys: string[] = [];
  return { keys, limit: async ({ key }: { key: string }) => { keys.push(key); return { success: allow }; } };
}
function siteverify(result: unknown, ok = true) {
  const calls: URLSearchParams[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => { calls.push(init.body as URLSearchParams); return new Response(JSON.stringify(result), { status: ok ? 200 : 500 }); }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const request = (token: string | null = "token", ip = "203.0.113.7") => new Request(origin + "/api/sessions", { method: "POST", headers: { "CF-Connecting-IP": ip, ...(token === null ? {} : { [TURNSTILE_HEADER]: token }) } });
const env = (allow = true, secret = "real-secret") => ({ SESSION_CREATE_LIMITER: limiter(allow), TURNSTILE_SECRET_KEY: secret }) as unknown as Parameters<typeof guardCreate>[0];

test("session creation is rate limited per CF-Connecting-IP before Turnstile is consulted", async () => {
  const e = env(false), verify = siteverify({ success: true });
  const response = await guardCreate(e, request(), verify.fetcher);
  assert.equal(response?.status, 429);
  assert.equal(response?.headers.get("Retry-After"), "60");
  assert.deepEqual(await response?.json(), { error: "嘗試太頻繁了，請稍候一分鐘再試。", code: "rate_limited" });
  assert.deepEqual((e.SESSION_CREATE_LIMITER as unknown as { keys: string[] }).keys, ["203.0.113.7"]);
  assert.equal(verify.calls.length, 0);
});

test("a missing or oversized token is rejected without calling siteverify", async () => {
  for (const token of [null, "", "x".repeat(2049)]) {
    const verify = siteverify({ success: true });
    assert.equal((await guardCreate(env(), request(token), verify.fetcher))?.status, 403);
    assert.equal(verify.calls.length, 0);
  }
});

test("a missing secret fails closed", async () => {
  const verify = siteverify({ success: true });
  const response = await guardCreate(env(true, ""), request(), verify.fetcher);
  assert.equal(response?.status, 503);
  assert.equal(verify.calls.length, 0);
});

test("siteverify gets the secret, token and client IP; real keys must match this action and host", async () => {
  const pass = siteverify({ success: true, action: TURNSTILE_ACTION, hostname: "agent-mbti.example.workers.dev" });
  assert.equal(await guardCreate(env(), request(), pass.fetcher), null);
  assert.deepEqual(Object.fromEntries(pass.calls[0]), { secret: "real-secret", response: "token", remoteip: "203.0.113.7" });
  for (const result of [{ success: false }, { success: true, action: "other", hostname: "agent-mbti.example.workers.dev" }, { success: true, action: TURNSTILE_ACTION, hostname: "evil.example" }]) {
    assert.equal((await guardCreate(env(), request(), siteverify(result).fetcher))?.status, 403);
  }
});

test("Cloudflare test keys pass without action or hostname, and siteverify outages fail closed", async () => {
  assert.equal(await guardCreate(env(), request(), siteverify({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } }).fetcher), null);
  assert.equal((await guardCreate(env(), request(), siteverify({}, false).fetcher))?.status, 503);
  const offline = (async () => { throw new TypeError("network"); }) as unknown as typeof fetch;
  assert.equal((await guardCreate(env(), request(), offline))?.status, 503);
});

test("write-token endpoints only check the per-IP write limit", async () => {
  const allowed = { WRITE_LIMITER: limiter(true) } as unknown as Parameters<typeof guardWrite>[0];
  assert.equal(await guardWrite(allowed, request(null, "198.51.100.2")), null);
  assert.deepEqual((allowed.WRITE_LIMITER as unknown as { keys: string[] }).keys, ["198.51.100.2"]);
  const blocked = { WRITE_LIMITER: limiter(false) } as unknown as Parameters<typeof guardWrite>[0];
  assert.equal((await guardWrite(blocked, request(null)))?.status, 429);
});
