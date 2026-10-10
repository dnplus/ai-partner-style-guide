import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Worker } from "node:worker_threads";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
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
  const skip = new Set([
    join(home, ".claude/projects/demo/stale.jsonl"),
    join(home, ".cursor/projects/demo/agent-transcripts/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee/bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl"),
    join(home, ".cursor/projects/demo/agent-transcripts/cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee/cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee.jsonl"),
    join(home, ".cursor/projects/demo/agent-transcripts/dddddddd-dddd-4ccc-8ddd-eeeeeeeeeeee/dddddddd-dddd-4ccc-8ddd-eeeeeeeeeeee.jsonl"),
  ]);
  touchTree(home, new Date("2026-10-03T04:00:00Z"), skip);
  return home;
}

function touchTree(root: string, when: Date, skip: Set<string>) {
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) touchTree(path, when, skip);
    else if (!skip.has(path)) utimesSync(path, when, when);
  }
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
  assert.match(result.stdout, /candidates=6\nfiles_read=8\ncandidates_by_client codex=1 claude-code=1 antigravity=0 cursor=1 other=3\n/);
  assert.equal(statSync(out).mode & 0o777, 0o600);
  const digest = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(digest.window, { from: "2026-09-30T16:00:00Z", to: "2026-10-10T16:00:00Z", timeZone: "Asia/Taipei" });
  assert.deepEqual(digest.observedPeriod, { from: "2026-10-03", to: "2026-10-04" });
  assert.deepEqual(digest.coverage, {
    scope: "partial",
    sources: ["codex", "claude-code", "cursor", "other"],
    gaps: ["web_history_unavailable", "no_artifact_inspection", "no_tokscale", "unattributed_runs", "other_sources_missing"],
    sampledSessions: 8,
  });
  assert.deepEqual(digest.metrics, {
    humanSessions: null,
    automatedSessions: null,
    subagentSessions: null,
    userMessages: null,
    inputTokens: null,
    outputTokens: null,
    tokenSource: "unavailable",
    modelUsage: [],
    modelUsageUnit: "unknown",
    mostUsedModelFamily: "unknown",
    mostUsedClient: "unknown",
  });
  assert.equal(digest.candidates.length, 6);
  assert.deepEqual(digest.candidates[2], {
    ref: "C03",
    client: "claude-code",
    date: "2026-10-03",
    turns: [
      { n: 1, role: "user", kind: "message", text: "Email [email] lives at [path] and uses [secret] for [link]" },
      { n: 2, role: "user", kind: "message", text: "Please also check the other case." },
      { n: 3, role: "agent", kind: "message", text: "Shipped the patch after checking the failing test." },
    ],
  });
  assert.deepEqual(digest.candidates[0].turns[3], { n: 4, role: "agent", kind: "tool", text: "Shell" });
  assert.deepEqual(digest.candidates.map((candidate: { ref: string; client: string }) => [candidate.ref, candidate.client]), [
    ["C01", "cursor"],
    ["C02", "other"],
    ["C03", "claude-code"],
    ["C04", "codex"],
    ["C05", "other"],
    ["C06", "other"],
  ]);
  assert.equal(digest.candidates[1].turns[0].text, "Grok user one");
  assert.equal(digest.candidates[3].turns[0].text, "Codex user one");
  assert.equal(digest.candidates[4].turns[0].text, "Hermes user one");
  assert.equal(digest.candidates[5].turns[0].text, "OpenCode user one");
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

test("cursor samples an untimed file only when creation and mtime are both inside the window", async () => {
  const home = mkdtempSync(join(tmpdir(), "collector-cursor-"));
  const insideId = "cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee";
  const outsideId = "dddddddd-dddd-4ccc-8ddd-eeeeeeeeeeee";
  const earlyId = "eeeeeeee-eeee-4ccc-8ddd-ffffffffffff";
  for (const id of [insideId, outsideId]) {
    const dir = join(home, ".cursor/projects/demo/agent-transcripts", id);
    mkdirSync(dir, { recursive: true });
    cpSync(join(fixture, ".cursor/projects/demo/agent-transcripts", id, `${id}.jsonl`), join(dir, `${id}.jsonl`));
  }
  const earlyDir = join(home, ".cursor/projects/demo/agent-transcripts", earlyId);
  mkdirSync(earlyDir, { recursive: true });
  cpSync(join(fixture, ".cursor/projects/demo/agent-transcripts", outsideId, `${outsideId}.jsonl`), join(earlyDir, `${earlyId}.jsonl`));
  const inside = join(home, ".cursor/projects/demo/agent-transcripts", insideId, `${insideId}.jsonl`);
  const outside = join(home, ".cursor/projects/demo/agent-transcripts", outsideId, `${outsideId}.jsonl`);
  const early = join(earlyDir, `${earlyId}.jsonl`);
  setFileTimes(inside, "2026-10-03T02:00:00Z", "2026-10-04T03:00:00Z");
  setFileTimes(outside, "2026-10-03T02:00:00Z", "2026-10-11T00:00:00Z");
  setFileTimes(early, "2026-09-01T00:00:00Z", "2026-10-03T04:00:00Z");
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
  assert.match(result.stdout, /candidates=1\nfiles_read=2\ncandidates_by_client cursor=1\n/);
  const digest = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(digest.observedPeriod, { from: "2026-10-03", to: "2026-10-03" });
  assert.deepEqual(digest.coverage, {
    scope: "partial",
    sources: ["cursor"],
    gaps: ["web_history_unavailable", "no_artifact_inspection", "no_tokscale", "unattributed_runs"],
    sampledSessions: 2,
  });
  assert.deepEqual(digest.metrics, {
    humanSessions: null,
    automatedSessions: null,
    subagentSessions: null,
    userMessages: null,
    inputTokens: null,
    outputTokens: null,
    tokenSource: "unavailable",
    modelUsage: [],
    modelUsageUnit: "unknown",
    mostUsedModelFamily: "unknown",
    mostUsedClient: "unknown",
  });
  assert.deepEqual(digest.candidates, [{
    ref: "C01",
    client: "cursor",
    date: "2026-10-03",
    turns: [
      { n: 1, role: "user", kind: "message", text: "Cursor file user one" },
      { n: 2, role: "user", kind: "message", text: "Cursor file user two" },
      { n: 3, role: "agent", kind: "message", text: "Cursor file agent" },
    ],
  }]);
  const raw = readFileSync(out, "utf8");
  assert.equal(raw.includes("Cursor file kept out"), false);
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

function run(args: string[], home: string, input = token + "\n", env: Record<string, string> = {}) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const worker = new Worker(`
      import { spawnSync } from "node:child_process";
      import { parentPort, workerData } from "node:worker_threads";
      const result = spawnSync("python3", workerData.args, { cwd: workerData.cwd, env: workerData.env, encoding: "utf8", input: workerData.input });
      parentPort.postMessage({ status: result.status, stdout: result.stdout, stderr: result.stderr });
    `, {
      eval: true,
      execArgv: ["--input-type=module"],
      workerData: { args: [script, ...args], cwd: process.cwd(), env: { ...process.env, HOME: home, ...env }, input },
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

const scanWindow = ["--from", "2026-09-30T16:00:00Z", "--to", "2026-10-10T16:00:00Z", "--tz", "Asia/Taipei"] as const;
const insideStamp = new Date("2026-10-03T04:00:00Z");

function claudeLog(path: string, marker: string) {
  writeFileSync(path, [
    `{"type":"user","timestamp":"2026-10-03T02:00:00Z","origin":{"kind":"human"},"message":{"role":"user","content":"${marker} one"}}`,
    `{"type":"user","timestamp":"2026-10-03T03:00:00Z","origin":{"kind":"human"},"message":{"role":"user","content":"${marker} two"}}`,
    `{"type":"assistant","timestamp":"2026-10-03T03:05:00Z","message":{"role":"assistant","content":"${marker} agent"}}`,
    "",
  ].join("\n"));
}

function codexLog(path: string, marker: string) {
  writeFileSync(path, [
    '{"timestamp":"2026-10-03T02:00:00Z","type":"session_meta","payload":{"source":"vscode"}}',
    `{"timestamp":"2026-10-03T02:00:00Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"text","text":"${marker} one"}]}}`,
    `{"timestamp":"2026-10-03T03:00:00Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"text","text":"${marker} two"}]}}`,
    `{"timestamp":"2026-10-03T03:05:00Z","type":"response_item","payload":{"type":"agent_message","content":[{"type":"text","text":"${marker} agent"}]}}`,
    "",
  ].join("\n"));
}

test("a spent budget stops before the remaining files are read", async () => {
  const home = mkdtempSync(join(tmpdir(), "collector-budget-"));
  const root = join(home, ".claude/projects/demo");
  mkdirSync(root, { recursive: true });
  for (const name of ["a", "b", "c"]) {
    const path = join(root, `${name}.jsonl`);
    claudeLog(path, `Budget ${name}`);
    utimesSync(path, insideStamp, insideStamp);
  }
  const out = join(home, "digest.json");
  const result = await run([
    "scan", ...scanWindow, "--sources", "claude-code", "--tokscale", "off", "--budget-seconds", "20", "--out", out,
  ], home, "", { COLLECTOR_FAKE_ELAPSED: "0,100" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /candidates=1\nfiles_read=1\ncandidates_by_client claude-code=1\n/);
  const digest = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(digest.coverage.scope, "partial");
  assert.equal(digest.coverage.sampledSessions, 1);
  assert.equal(digest.metrics.humanSessions, null);
  assert.equal(digest.metrics.userMessages, null);
  assert.equal(digest.candidates[0].turns[0].text, "Budget a one");
  const raw = readFileSync(out, "utf8");
  assert.equal(raw.includes("Budget b"), false);
  assert.equal(raw.includes("Budget c"), false);
  rmSync(home, { recursive: true, force: true });
});

test("a file read stops at 2 MB and leaves the tail out of the digest", async () => {
  const home = mkdtempSync(join(tmpdir(), "collector-cap-"));
  const root = join(home, ".claude/projects/demo");
  mkdirSync(root, { recursive: true });
  const small = join(root, "small.jsonl");
  claudeLog(small, "Small file user");
  utimesSync(small, insideStamp, insideStamp);
  const pad = '{"type":"user","timestamp":"2026-10-03T02:00:00Z","origin":{"kind":"human"},"message":{"role":"user","content":"pad"}}\n';
  const tail = [
    '{"type":"user","timestamp":"2026-10-04T02:00:00Z","origin":{"kind":"human"},"message":{"role":"user","content":"UNIQUE_TAIL_MARKER one"}}',
    '{"type":"user","timestamp":"2026-10-04T03:00:00Z","origin":{"kind":"human"},"message":{"role":"user","content":"UNIQUE_TAIL_MARKER two"}}',
    '{"type":"assistant","timestamp":"2026-10-04T03:05:00Z","message":{"role":"assistant","content":"UNIQUE_TAIL_MARKER agent"}}',
    "",
  ].join("\n");
  const big = join(root, "big.jsonl");
  writeFileSync(big, pad.repeat(Math.ceil((2 * 1024 * 1024 + 1) / pad.length)) + tail);
  assert.equal(statSync(big).size > 2 * 1024 * 1024, true);
  const later = new Date("2026-10-04T04:00:00Z");
  utimesSync(big, later, later);
  const out = join(home, "digest.json");
  const result = await run([
    "scan", ...scanWindow, "--sources", "claude-code", "--tokscale", "off", "--out", out,
  ], home, "");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /candidates=1\nfiles_read=2\ncandidates_by_client claude-code=1\n/);
  const digest = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(digest.coverage.scope, "partial");
  assert.equal(digest.coverage.sampledSessions, 2);
  assert.equal(digest.metrics.humanSessions, null);
  assert.equal(digest.candidates.length, 1);
  assert.equal(digest.candidates[0].turns[0].text, "Small file user one");
  assert.equal(readFileSync(out, "utf8").includes("UNIQUE_TAIL_MARKER"), false);
  rmSync(home, { recursive: true, force: true });
});

test("sampling spreads chosen files across more than one week and client", async () => {
  const home = mkdtempSync(join(tmpdir(), "collector-spread-"));
  const claudeRoot = join(home, ".claude/projects/demo");
  const codexRoot = join(home, ".codex/sessions/2026/10");
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  const rows = [
    [join(claudeRoot, "w40.jsonl"), "claude", "Week forty claude", "2026-09-30T16:00:00Z"],
    [join(claudeRoot, "w41.jsonl"), "claude", "Week forty one claude", "2026-10-05T04:00:00Z"],
    [join(codexRoot, "w40.jsonl"), "codex", "Week forty codex", "2026-09-30T16:00:00Z"],
    [join(codexRoot, "w41.jsonl"), "codex", "Week forty one codex", "2026-10-05T04:00:00Z"],
  ] as const;
  for (const [path, kind, marker, stamp] of rows) {
    if (kind === "claude") claudeLog(path, marker);
    else codexLog(path, marker);
    const when = new Date(stamp);
    utimesSync(path, when, when);
  }
  const out = join(home, "digest.json");
  const result = await run([
    "scan", ...scanWindow, "--sources", "claude-code,codex", "--tokscale", "off", "--out", out,
  ], home, "");
  assert.equal(result.status, 0, result.stderr);
  const digest = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(digest.candidates.map((candidate: { client: string; turns: { text: string }[] }) => [candidate.client, candidate.turns[0].text]), [
    ["claude-code", "Week forty claude one"],
    ["claude-code", "Week forty one claude one"],
    ["codex", "Week forty codex one"],
    ["codex", "Week forty one codex one"],
  ]);
  assert.equal(digest.coverage.sampledSessions, 4);
  assert.equal(digest.metrics.humanSessions, null);
  assert.equal(digest.metrics.automatedSessions, null);
  assert.equal(digest.metrics.subagentSessions, null);
  assert.equal(digest.metrics.userMessages, null);
  rmSync(home, { recursive: true, force: true });
});

test("token totals come from a tokscale client and model report", async () => {
  const home = scanHome();
  const bin = join(home, "bin");
  mkdirSync(bin);
  const binary = join(bin, "tokscale");
  writeFileSync(binary, `#!/bin/sh
printf '%s\\n' "$@" > "$HOME/tokscale-args"
cat <<'EOF'
{"entries":[{"client":"codex","model":"gpt-5.4","input":100,"output":40,"cacheRead":7,"messageCount":3},{"client":"claude","model":"claude-opus-4.7","input":100,"output":10,"cacheRead":1,"messageCount":2},{"client":"cursor","model":"gpt-5.4","input":50,"output":50,"cacheRead":0,"messageCount":4}]}
EOF
`);
  chmodSync(binary, 0o755);
  const out = join(home, "digest.json");
  const args = ["scan", ...scanWindow, "--sources", "codex,claude-code,antigravity,cursor,other", "--tokscale", "existing", "--out", out];
  const env = { PATH: `${bin}:${process.env.PATH ?? ""}` };
  const result = await run(args, home, "", env);
  assert.equal(result.status, 0, result.stderr);
  const digest = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(digest.metrics.inputTokens, 250);
  assert.equal(digest.metrics.outputTokens, 100);
  assert.equal(digest.metrics.tokenSource, "tokscale");
  assert.deepEqual(digest.metrics.modelUsage, [{ family: "openai", count: 240 }, { family: "anthropic", count: 110 }]);
  assert.equal(digest.metrics.modelUsageUnit, "reported_tokens");
  assert.equal(digest.metrics.mostUsedModelFamily, "openai");
  assert.equal(digest.metrics.mostUsedClient, "codex");
  assert.equal(digest.metrics.humanSessions, null);
  assert.equal(digest.coverage.gaps.includes("no_tokscale"), false);
  assert.equal(digest.coverage.gaps.includes("partial_window"), false);
  const recorded = readFileSync(join(home, "tokscale-args"), "utf8");
  assert.match(recorded, /--group-by\nclient,model\n/);
  assert.equal(recorded.includes("client,session,model"), false);
  assert.match(recorded, /--since\n2026-10-01\n/);
  assert.match(recorded, /--until\n2026-10-10\n/);
  writeFileSync(binary, `#!/bin/sh
cat <<'EOF'
{"entries":[{"client":"codex","model":"gpt-5.4","input":80,"output":20,"cacheRead":0,"messageCount":1},{"client":"claude","model":"claude-opus-4.7","input":80,"output":20,"cacheRead":0,"messageCount":1}]}
EOF
`);
  chmodSync(binary, 0o755);
  const tied = await run(args, home, "", env);
  assert.equal(tied.status, 0, tied.stderr);
  const tie = JSON.parse(readFileSync(out, "utf8"));
  assert.deepEqual(tie.metrics.modelUsage, [{ family: "anthropic", count: 100 }, { family: "openai", count: 100 }]);
  assert.equal(tie.metrics.modelUsageUnit, "reported_tokens");
  assert.equal(tie.metrics.mostUsedModelFamily, "unknown");
  assert.equal(tie.metrics.mostUsedClient, "unknown");
  assert.equal(tie.metrics.inputTokens, 160);
  assert.equal(tie.metrics.outputTokens, 40);
  rmSync(home, { recursive: true, force: true });
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
