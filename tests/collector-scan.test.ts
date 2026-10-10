import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Worker } from "node:worker_threads";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { COLLECTOR_SCRIPT_SHA256 } from "../lib/collector-script-hash.ts";

const script = "public/collector/collect.py";
const fixture = "tests/fixtures/collector-logs";
const token = "ab".repeat(32);
const session = "00000000-0000-4000-8000-0000000000aa";

function scanHome() {
  const home = mkdtempSync(join(tmpdir(), "collector-home-"));
  cpSync(fixture, home, { recursive: true });
  utimesSync(join(home, ".claude/projects/demo/stale.jsonl"), new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));
  utimesSync(join(home, ".cursor/projects/demo/agent-transcripts/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl"), new Date("2026-10-11T00:00:00Z"), new Date("2026-10-11T00:00:00Z"));
  for (const id of ["cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee", "dddddddd-dddd-4ccc-8ddd-eeeeeeeeeeee"]) {
    utimesSync(join(home, ".cursor/projects/demo/agent-transcripts", id, `${id}.jsonl`), new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));
  }
  const outside = join(home, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "note.jsonl"), [
    '{"type":"user","timestamp":"2026-10-03T02:00:00Z","origin":{"kind":"human"},"message":{"role":"user","content":"Linked user one"}}',
    '{"type":"user","timestamp":"2026-10-04T03:00:00Z","origin":{"kind":"human"},"message":{"role":"user","content":"Linked user two"}}',
    '{"type":"assistant","timestamp":"2026-10-04T03:05:00Z","message":{"role":"assistant","content":"Linked reply"}}',
    "",
  ].join("\n"));
  symlinkSync(join(outside, "note.jsonl"), join(home, ".claude/projects/demo/linked.jsonl"));
  mkdirSync(join(outside, "dir"));
  writeFileSync(join(outside, "dir/extra.jsonl"), readFileSync(join(outside, "note.jsonl")));
  symlinkSync(join(outside, "dir"), join(home, ".claude/projects/linked-dir"));
  return home;
}

test("scan digest counts fixture logs, keeps agent turns, and drops secrets and out-of-window lines", async () => {
  const home = scanHome();
  const out = join(home, "digest.json");
  const result = await run([
    "scan",
    "--from", "2026-09-30T16:00:00Z",
    "--to", "2026-10-10T16:00:00Z",
    "--tz", "Asia/Taipei",
    "--sources", "codex,claude-code,antigravity,cursor,other",
    "--tokscale", "off",
    "--out", out,
  ], home, "");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("ada@example.com"), false);
  assert.match(result.stdout, /human_sessions=6\nautomated_sessions=2\nsubagent_sessions=4\nuser_messages=12\ncandidates=6\nhuman_by_client codex=1 claude-code=1 antigravity=0 cursor=1 other=3\n/);
  assert.equal(statSync(out).mode & 0o777, 0o600);
  const digest = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(digest.window, { from: "2026-09-30T16:00:00Z", to: "2026-10-10T16:00:00Z", timeZone: "Asia/Taipei" });
  assert.deepEqual(digest.observedPeriod, { from: "2026-10-03", to: "2026-10-04" });
  assert.deepEqual(digest.coverage, {
    scope: "partial",
    sources: ["codex", "claude-code", "cursor", "other"],
    gaps: ["web_history_unavailable", "no_artifact_inspection", "no_tokscale", "unattributed_runs", "other_sources_missing"],
    sampledSessions: 12,
  });
  assert.deepEqual(digest.metrics, {
    humanSessions: 6,
    automatedSessions: 2,
    subagentSessions: 4,
    userMessages: 12,
    inputTokens: null,
    outputTokens: null,
    tokenSource: "unavailable",
    modelUsage: [],
    modelUsageUnit: "unknown",
    mostUsedModelFamily: "unknown",
    mostUsedClient: "other",
  });
  assert.equal(digest.candidates.length, 6);
  assert.deepEqual(digest.candidates[0], {
    ref: "C01",
    client: "claude-code",
    date: "2026-10-03",
    turns: [
      { n: 1, role: "user", kind: "message", text: "Email [email] lives at [path] and uses [secret] for [link]" },
      { n: 2, role: "user", kind: "message", text: "Please also check the other case." },
      { n: 3, role: "agent", kind: "message", text: "Shipped the patch after checking the failing test." },
    ],
  });
  assert.deepEqual(digest.candidates[2].turns[3], { n: 4, role: "agent", kind: "tool", text: "Shell" });
  assert.deepEqual(digest.candidates.map((candidate: { ref: string; client: string }) => [candidate.ref, candidate.client]), [
    ["C01", "claude-code"],
    ["C02", "codex"],
    ["C03", "cursor"],
    ["C04", "other"],
    ["C05", "other"],
    ["C06", "other"],
  ]);
  for (const candidate of digest.candidates) assert.equal(candidate.turns.some((turn: { role: string }) => turn.role === "agent"), true);
  const raw = readFileSync(out, "utf8");
  for (const secret of ["ada@example.com", "/Users/ada", "abcdefghijklmnop", "https://example.com", "This line is outside the window.", "Codex outside", "OpenCode outside", "Hermes outside", "Stale mtime", "Linked user", "Untimed cursor", "Subagent user"]) {
    assert.equal(raw.includes(secret), false, secret);
  }
  rmSync(home, { recursive: true, force: true });
});

function setFileTimes(path: string, birthIso: string, mtimeIso: string) {
  const birth = Math.floor(new Date(birthIso).getTime() / 1000);
  const mtime = new Date(mtimeIso);
  utimesSync(path, mtime, mtime);
  execFileSync("python3", ["-c", `
import ctypes, ctypes.util, os, sys
libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
class AttrList(ctypes.Structure):
    _fields_ = [("bitmapcount", ctypes.c_ushort), ("reserved", ctypes.c_ushort), ("commonattr", ctypes.c_uint), ("volattr", ctypes.c_uint), ("dirattr", ctypes.c_uint), ("fileattr", ctypes.c_uint), ("forkattr", ctypes.c_uint)]
class TimeSpec(ctypes.Structure):
    _fields_ = [("tv_sec", ctypes.c_long), ("tv_nsec", ctypes.c_long)]
attr = AttrList()
attr.bitmapcount = 5
attr.commonattr = 0x00000200
times = TimeSpec(int(sys.argv[1]), 0)
if libc.setattrlist(os.fsencode(sys.argv[2]), ctypes.byref(attr), ctypes.byref(times), ctypes.sizeof(times), 0) != 0:
    err = ctypes.get_errno()
    raise OSError(err, os.strerror(err), sys.argv[2])
`, String(birth), path], { stdio: "pipe" });
}

test("cursor counts a session only when creation and mtime are both inside the window", async () => {
  const home = mkdtempSync(join(tmpdir(), "collector-cursor-"));
  const insideId = "cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee";
  const outsideId = "dddddddd-dddd-4ccc-8ddd-eeeeeeeeeeee";
  for (const id of [insideId, outsideId]) {
    const dir = join(home, ".cursor/projects/demo/agent-transcripts", id);
    mkdirSync(dir, { recursive: true });
    cpSync(join(fixture, ".cursor/projects/demo/agent-transcripts", id, `${id}.jsonl`), join(dir, `${id}.jsonl`));
  }
  const inside = join(home, ".cursor/projects/demo/agent-transcripts", insideId, `${insideId}.jsonl`);
  const outside = join(home, ".cursor/projects/demo/agent-transcripts", outsideId, `${outsideId}.jsonl`);
  setFileTimes(inside, "2026-10-03T02:00:00Z", "2026-10-04T03:00:00Z");
  setFileTimes(outside, "2026-10-03T02:00:00Z", "2026-10-11T00:00:00Z");
  const out = join(home, "digest.json");
  const result = await run([
    "scan",
    "--from", "2026-09-30T16:00:00Z",
    "--to", "2026-10-10T16:00:00Z",
    "--tz", "Asia/Taipei",
    "--sources", "cursor",
    "--tokscale", "off",
    "--out", out,
  ], home, "");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /human_sessions=1\nautomated_sessions=0\nsubagent_sessions=0\nuser_messages=2\ncandidates=0\nhuman_by_client cursor=1\n/);
  const digest = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(digest.observedPeriod, { from: "2026-10-03", to: "2026-10-03" });
  assert.deepEqual(digest.coverage, {
    scope: "partial",
    sources: ["cursor"],
    gaps: ["web_history_unavailable", "no_artifact_inspection", "no_tokscale", "unattributed_runs"],
    sampledSessions: 1,
  });
  assert.deepEqual(digest.metrics, {
    humanSessions: 1,
    automatedSessions: 0,
    subagentSessions: 0,
    userMessages: 2,
    inputTokens: null,
    outputTokens: null,
    tokenSource: "unavailable",
    modelUsage: [],
    modelUsageUnit: "unknown",
    mostUsedModelFamily: "unknown",
    mostUsedClient: "cursor",
  });
  assert.deepEqual(digest.candidates, []);
  const raw = readFileSync(out, "utf8");
  for (const secret of ["Cursor file user one", "Cursor file kept out one", "Cursor file agent"]) {
    assert.equal(raw.includes(secret), false, secret);
  }
  rmSync(home, { recursive: true, force: true });
});

test("served collector script hash matches the checked-in constant", () => {
  const digest = createHash("sha256").update(readFileSync(script)).digest("hex");
  assert.equal(COLLECTOR_SCRIPT_SHA256, digest);
});

function listen(codes: number[]) {
  const requests: { url: string; auth: string | undefined; key: string | undefined; body: string }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        url: request.url ?? "",
        auth: request.headers.authorization,
        key: request.headers["idempotency-key"] as string | undefined,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      const code = codes[Math.min(requests.length, codes.length) - 1];
      response.writeHead(code, code === 302 ? { location: "https://evil.example/collect" } : { "content-type": "application/json" });
      response.end(code === 201 || code === 200 ? JSON.stringify({ accepted: true, duplicate: code === 200 }) : "");
    });
  });
  return new Promise<{ server: typeof server; requests: typeof requests; port: number }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("missing port");
      resolve({ server, requests, port: address.port });
    });
  });
}

function run(args: string[], home: string, input = token + "\n") {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const worker = new Worker(`
      import { spawnSync } from "node:child_process";
      import { parentPort, workerData } from "node:worker_threads";
      const result = spawnSync("python3", workerData.args, { cwd: workerData.cwd, env: workerData.env, encoding: "utf8", input: workerData.input });
      parentPort.postMessage({ status: result.status, stdout: result.stdout, stderr: result.stderr });
    `, {
      eval: true,
      execArgv: ["--input-type=module"],
      workerData: { args: [script, ...args], cwd: process.cwd(), env: { ...process.env, HOME: home }, input },
    });
    worker.on("message", (message) => resolve(message));
    worker.on("error", reject);
  });
}

test("submit keeps the bearer token off disk and retries only a 503", async () => {
  const home = mkdtempSync(join(tmpdir(), "collector-submit-"));
  const summary = join(home, "summary.json");
  writeFileSync(summary, JSON.stringify({ version: "2.0", kind: "observed" }));
  const endpoint = await listen([503, 503, 201, 200]);
  try {
    const args = ["submit", "--origin", `http://127.0.0.1:${endpoint.port}`, "--session", session, "--summary", summary];
    assert.equal(args.includes(token), false);
    const first = await run(args, home);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, "http 201\n");
    const retried = await run(args, home);
    assert.equal(retried.status, 0, retried.stderr);
    assert.equal(retried.stdout, "http 200\n");
    assert.equal(endpoint.requests.length, 4);
    assert.deepEqual(endpoint.requests.map((request) => request.key), [endpoint.requests[0].key, endpoint.requests[0].key, endpoint.requests[0].key, endpoint.requests[0].key]);
    assert.equal(endpoint.requests[0].auth, "Bearer " + token);
    assert.equal(endpoint.requests[0].url, "/api/collect/" + session);
    assert.equal(endpoint.requests.every((request) => !request.url.includes(token)), true);
    assert.equal(readFileSync(summary, "utf8").includes(token), false);
    const keyPath = summary + ".idempotency";
    assert.equal(readFileSync(keyPath, "utf8").includes(token), false);
    assert.equal(statSync(keyPath).mode & 0o777, 0o600);
  } finally {
    endpoint.server.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("submit stops on 409 and on a redirect", async () => {
  const home = mkdtempSync(join(tmpdir(), "collector-stop-"));
  const summary = join(home, "summary.json");
  writeFileSync(summary, "{\"ok\":true}");
  const conflict = await listen([409]);
  try {
    const denied = await run(["submit", "--origin", `http://127.0.0.1:${conflict.port}`, "--session", session, "--summary", summary], home);
    assert.equal(denied.stdout, "http 409\n");
    assert.equal(conflict.requests.length, 1);
  } finally {
    conflict.server.close();
  }
  const other = join(home, "other.json");
  writeFileSync(other, "{\"ok\":true}");
  const redirect = await listen([302]);
  try {
    const moved = await run(["submit", "--origin", `http://127.0.0.1:${redirect.port}`, "--session", session, "--summary", other], home);
    assert.equal(moved.status, 0, moved.stderr);
    assert.equal(moved.stdout, "http 302\n");
    assert.equal(redirect.requests.length, 1);
  } finally {
    redirect.server.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("status posts the observed phase and does not store the token", async () => {
  const home = mkdtempSync(join(tmpdir(), "collector-status-"));
  const endpoint = await listen([201]);
  try {
    const result = await run([
      "status", "--origin", `http://127.0.0.1:${endpoint.port}`, "--session", session, "--sequence", "2", "--phase", "validating",
    ], home);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "http 201\n");
    assert.equal(endpoint.requests[0].body, '{"sequence":2,"phase":"validating","approvalKind":null}');
    assert.equal(endpoint.requests[0].url, "/api/collect/" + session + "/status");
    assert.equal(endpoint.requests[0].key, undefined);
  } finally {
    endpoint.server.close();
    rmSync(home, { recursive: true, force: true });
  }
});
