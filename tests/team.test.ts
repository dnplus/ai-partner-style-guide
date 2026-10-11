import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare} from 'miniflare';
import {handleSession} from '../lib/session-service.ts';
import {handleTeam, TEAM_TTL_MS, type TeamRoute, type TeamSnapshot} from '../lib/team-service.ts';
import {makeLevelFixture} from '../lib/fixture.ts';

let mf: Miniflare; let db: D1Database; let directory: string;
const now = Date.parse('2026-10-10T12:00:00Z');
const origin = 'http://127.0.0.1:5188';
type Session = {id: string; readToken: string; writeToken: string; nickname: string};
type Team = {id: string; name: string; viewToken: string; joinCode: string; expiresAt: number};
type Board = {name: string; joinCode: string; entries: {id: string; member: string; snapshot: TeamSnapshot}[]};

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agent-mbti-team-'));
  mf = new Miniflare({modules: true, script: 'export default {fetch(){return new Response("test")}}', d1Databases: {DB: 'team-test'}, d1Persist: directory, compatibilityDate: '2026-05-15', cf: false});
  db = await mf.getD1Database('DB') as unknown as D1Database;
  for (const migration of (await readdir(new URL('../drizzle/', import.meta.url))).filter((p) => p.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL('../drizzle/' + migration, import.meta.url), 'utf8');
    for (const q of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) await db.prepare(q).run();
  }
});
after(async () => { await mf.dispose(); await rm(directory, {recursive: true, force: true}); });

function request(path: string, method: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) {
  return new Request(origin + path, {method, headers: {'content-type': 'application/json', ...(method === 'GET' ? {} : {origin}), ...(token ? {authorization: `Bearer ${token}`} : {}), ...headers}, ...(payload === undefined ? {} : {body: JSON.stringify(payload)})});
}
const call = (path: string, route: TeamRoute, method: string, token?: string, payload?: unknown, at = now) => handleTeam(db, request(path, method, token, payload), route, at);
async function team(name = '前端小組'): Promise<Team> {
  const r = await call('/api/teams', {}, 'POST', undefined, {name});
  assert.equal(r.status, 201);
  return await r.json() as Team;
}
const board = (t: Team, token = t.viewToken, at = now) => call(`/api/teams/${t.id}`, {team: t.id}, 'GET', token, undefined, at);
async function observed(nickname = '小克', kind: 'observed' | 'fixture' = 'observed'): Promise<Session> {
  const created = await handleSession(db, request('/api/sessions', 'POST', undefined, {nickname, protocolVersion: '3.0'}), undefined, 'session', now);
  const s = await created.json() as Session;
  const payload = {...makeLevelFixture(nickname), kind};
  const sent = await handleSession(db, request(`/api/collect/${s.id}`, 'POST', s.writeToken, payload, {'idempotency-key': 'team-test-key-' + s.id.slice(0, 8)}), s.id, 'collect', now);
  assert.equal(sent.status, 201);
  return s;
}
const share = (t: Team, s: Session, member = '阿明', readToken = s.readToken) => call(`/api/teams/join/${t.joinCode}/entries`, {code: t.joinCode}, 'POST', undefined, {sessionId: s.id, readToken, member});

test('an owner creates a board that only the view token opens; the join code reveals just the name', async () => {
  const t = await team();
  assert.match(t.viewToken, /^[0-9a-f]{64}$/);
  assert.match(t.joinCode, /^[0-9a-f]{32}$/);
  assert.equal(t.expiresAt, now + TEAM_TTL_MS);
  const opened = await (await board(t)).json() as Board;
  assert.deepEqual([opened.name, opened.joinCode, opened.entries], ['前端小組', t.joinCode, []]);
  assert.equal((await board(t, 'f'.repeat(64))).status, 404);
  assert.deepEqual(await (await call(`/api/teams/join/${t.joinCode}`, {code: t.joinCode}, 'GET')).json(), {name: '前端小組'});
  assert.equal((await call('/api/teams/join/' + '0'.repeat(32), {code: '0'.repeat(32)}, 'GET')).status, 404);
  const foreign = await handleTeam(db, request('/api/teams', 'POST', undefined, {name: '外站'}, {origin: 'https://evil.example'}), {}, now);
  assert.equal(foreign.status, 403);
});

test('a member shares an observed result once; the board gets the card and the collector counts, nothing else', async () => {
  const t = await team('設計組');
  const s = await observed('小克');
  const first = await share(t, s);
  assert.equal(first.status, 201);
  const shared = await first.json() as {entryId: string; withdrawToken: string; team: string};
  assert.equal(shared.team, '設計組');
  const again = await share(t, s, '阿明 Chen');
  assert.equal(again.status, 201);
  const {entries} = await (await board(t)).json() as Board;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].member, '阿明 Chen');
  const snapshot = entries[0].snapshot;
  assert.deepEqual(Object.keys(snapshot).sort(), ['assessment', 'client', 'modelFamily', 'nickname', 'observedPeriod', 'scope', 'stats', 'usageLevel']);
  assert.equal(snapshot.nickname, '小克');
  assert.equal(snapshot.stats.judged, 3);
  assert.equal(JSON.stringify(entries).includes('T001'), false);
  assert.equal((await share(t, await observed('示範', 'fixture'))).status, 422);
  assert.equal((await share(t, s, '阿明', 'e'.repeat(64))).status, 404);
  assert.equal((await share(t, s, '<script>')).status, 400);
});

test('a member withdraws with their token; the owner can remove entries or the whole board', async () => {
  const t = await team('後端組');
  const a = await (await share(t, await observed('甲'))).json() as {entryId: string; withdrawToken: string};
  const b = await (await share(t, await observed('乙'), '小乙')).json() as {entryId: string; withdrawToken: string};
  const withdraw = (entry: string, token: string) => call(`/api/teams/join/${t.joinCode}/entries/${entry}`, {code: t.joinCode, entry}, 'DELETE', token);
  assert.equal((await withdraw(a.entryId, b.withdrawToken)).status, 404);
  assert.equal((await withdraw(a.entryId, a.withdrawToken)).status, 200);
  assert.deepEqual((await (await board(t)).json() as Board).entries.map((e) => e.member), ['小乙']);
  assert.equal((await call(`/api/teams/${t.id}/entries/${b.entryId}`, {team: t.id, entry: b.entryId}, 'DELETE', t.viewToken)).status, 200);
  assert.deepEqual((await (await board(t)).json() as Board).entries, []);
  assert.equal((await call(`/api/teams/${t.id}`, {team: t.id}, 'DELETE', t.viewToken)).status, 200);
  assert.equal((await board(t)).status, 404);
  assert.equal((await call(`/api/teams/join/${t.joinCode}`, {code: t.joinCode}, 'GET')).status, 404);
});

test('a board past its retention closes and is swept with its entries', async () => {
  const t = await team('短期組');
  await share(t, await observed('丙'));
  const later = now + TEAM_TTL_MS + 1;
  assert.equal((await board(t, t.viewToken, later)).status, 404);
  await call('/api/teams', {}, 'POST', undefined, {name: '新組'}, later);
  const left = await db.prepare('SELECT (SELECT count(*) FROM teams WHERE id=?1) AS teams, (SELECT count(*) FROM team_entries WHERE team_id=?1) AS entries').bind(t.id).first<{teams: number; entries: number}>();
  assert.deepEqual(left, {teams: 0, entries: 0});
});
