import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Miniflare} from 'miniflare';
import {handleSession, TTL_MS} from '../lib/session-service.ts';
import {handleRemembered} from '../lib/remembered-service.ts';
import {createPublicCard, revokePublicCard, loadPublicCard, CARD_TTL_MS} from '../lib/public-card-service.ts';
import {postText, agentSharePrompt} from '../lib/share-kit.ts';
import {toReport, toCardObservation} from '../lib/assessment.ts';
import {makeLevelFixture} from '../lib/fixture.ts';

let mf: Miniflare; let db: D1Database; let directory: string;
const now = Date.parse('2026-10-10T12:00:00Z');
const origin = 'http://127.0.0.1:5188';
type Session = {id: string; readToken: string; writeToken: string; nickname: string};
type Created = {id: string; url: string; revokeToken: string};
const look = {family: 'grok', style: 'chibi', nicknameOnly: false, locale: 'zh-TW'};

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agent-mbti-card-'));
  mf = new Miniflare({modules: true, script: 'export default {fetch(){return new Response("test")}}', d1Databases: {DB: 'card-test'}, d1Persist: directory, compatibilityDate: '2026-05-15', cf: false});
  db = await mf.getD1Database('DB') as unknown as D1Database;
  for (const migration of (await readdir(new URL('../drizzle/', import.meta.url))).filter((p) => p.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL('../drizzle/' + migration, import.meta.url), 'utf8');
    for (const q of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) await db.prepare(q).run();
  }
});
after(async () => { await mf.dispose(); await rm(directory, {recursive: true, force: true}); });

function request(path: string, method: string, payload?: unknown, headers: Record<string, string> = {}) {
  return new Request(origin + path, {method, headers: {'content-type': 'application/json', origin, ...headers}, ...(payload === undefined ? {} : {body: JSON.stringify(payload)})});
}
async function observed(nickname = '小克', kind: 'observed' | 'fixture' = 'observed'): Promise<Session> {
  const s = await (await handleSession(db, request('/api/sessions', 'POST', {nickname, protocolVersion: '3.0'}), undefined, 'session', now)).json() as Session;
  const sent = await handleSession(db, request(`/api/collect/${s.id}`, 'POST', {...makeLevelFixture(nickname), kind}, {authorization: `Bearer ${s.writeToken}`, 'idempotency-key': 'card-test-key-' + s.id.slice(0, 8)}), s.id, 'collect', now);
  assert.equal(sent.status, 201);
  return s;
}
const create = (body: Record<string, unknown>, headers: Record<string, string> = {}, at = now) => createPublicCard(db, request('/api/remembered/card', 'POST', body, headers), at);
const revoke = (id: string, token: string) => revokePublicCard(db, request('/api/cards/' + id, 'DELETE', undefined, {authorization: `Bearer ${token}`}), id);

test('a live session turns its result into a public card the server draws from the record', async () => {
  const s = await observed();
  const r = await create({sessionId: s.id, readToken: s.readToken, ...look});
  assert.equal(r.status, 201);
  const created = await r.json() as Created;
  assert.match(created.id, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(created.url, `${origin}/c/${created.id}`);
  const card = await loadPublicCard(db, created.id, now);
  const expected = toCardObservation(toReport({...makeLevelFixture('小克'), kind: 'observed'}));
  assert.deepEqual([card!.card.assessment, card!.card.usageLevel, card!.family, card!.style, card!.locale], [expected.assessment, expected.usageLevel, 'grok', 'chibi', 'zh-TW']);
  assert.equal(JSON.stringify(card).includes(s.readToken), false);
  assert.equal((await create({sessionId: s.id, readToken: 'f'.repeat(64), ...look})).status, 404);
  assert.equal((await create({...look, family: 'nope'})).status, 400);
  const fixture = await observed('示範', 'fixture');
  assert.equal((await create({sessionId: fixture.id, readToken: fixture.readToken, ...look})).status, 422);
  const foreign = await createPublicCard(db, request('/api/remembered/card', 'POST', {sessionId: s.id, readToken: s.readToken, ...look}, {origin: 'https://evil.example'}), now);
  assert.equal(foreign.status, 403);
});

test('creating again keeps the address, refreshes the look and replaces the revoke token', async () => {
  const s = await observed('Nova');
  const first = await (await create({sessionId: s.id, readToken: s.readToken, ...look})).json() as Created;
  const second = await (await create({sessionId: s.id, readToken: s.readToken, ...look, family: 'claude', nicknameOnly: true})).json() as Created;
  assert.equal(second.id, first.id);
  assert.deepEqual([(await loadPublicCard(db, first.id, now))!.family, (await loadPublicCard(db, first.id, now))!.nicknameOnly], ['claude', true]);
  assert.equal((await revoke(first.id, first.revokeToken)).status, 404);
  assert.equal((await revoke(first.id, second.revokeToken)).status, 200);
  assert.equal(await loadPublicCard(db, first.id, now), null);
});

test('after the link expires the remembered-result cookie still authorizes, and clearing the result removes the card', async () => {
  const s = await observed('Rex');
  const saved = await handleRemembered(db, request('/api/remembered', 'POST', {sessionId: s.id, readToken: s.readToken}), now);
  const cookie = saved.headers.get('set-cookie')!.split(';')[0];
  const later = now + TTL_MS + 1;
  assert.equal((await create({sessionId: s.id, readToken: s.readToken, ...look}, {}, later)).status, 410);
  const created = await (await create(look, {cookie}, later)).json() as Created;
  assert.ok(await loadPublicCard(db, created.id, later));
  assert.equal((await handleRemembered(db, request('/api/remembered', 'DELETE', undefined, {cookie}), later)).status, 200);
  assert.equal(await loadPublicCard(db, created.id, later), null);
});

test('deleting the session without keeping the result removes its card; an expired card no longer loads', async () => {
  const s = await observed('Kai');
  const created = await (await create({sessionId: s.id, readToken: s.readToken, ...look})).json() as Created;
  assert.equal(await loadPublicCard(db, created.id, now + CARD_TTL_MS + 1), null);
  await handleSession(db, request('/api/sessions/' + s.id, 'DELETE', undefined, {authorization: `Bearer ${s.readToken}`}), s.id, 'session', now);
  assert.equal(await loadPublicCard(db, created.id, now), null);
});

test('the post and the agent prompt carry the link, the type and the level, and ask before posting', () => {
  const card = toCardObservation(toReport({...makeLevelFixture('小克'), kind: 'observed'}));
  const url = 'https://agent-mbti.example/c/abcdefghijklmnopqrstuv';
  const post = postText(card, url, 'zh-TW', false);
  assert.ok(post.includes(url) && post.includes(card.assessment.pattern) && post.includes('LV ' + card.usageLevel.value) && post.includes('#AgentMBTI'));
  assert.equal(postText(card, url, 'en', true).includes(card.assessment.pattern), false);
  const prompt = agentSharePrompt(card, url, 'en', false).split('\n');
  assert.equal(prompt.length, 4);
  assert.ok(prompt[1].includes(url) && prompt[3].includes('approve'));
});
