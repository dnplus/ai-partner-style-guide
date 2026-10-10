import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import { handleSession, TTL_MS } from '../lib/session-service.ts';
import { makeFixture } from '../lib/fixture.ts';

let mf: Miniflare; let db: D1Database; let directory: string;
const now = Date.parse('2026-10-10T12:00:00Z');
const origin = 'http://127.0.0.1:5188';
const legacy={id:'00000000-0000-4000-8000-000000000001',readToken:'a'.repeat(64),writeToken:'b'.repeat(64),expiresAt:now+TTL_MS,nickname:'舊範例'};
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
type Session = { id:string;readToken:string;writeToken:string;expiresAt:number;nickname:string };
function runtime(){return new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',d1Databases:{DB:'session-test'},d1Persist:directory,compatibilityDate:'2026-05-15',cf:false});}
before(async()=>{directory=await mkdtemp(join(tmpdir(),'ai-persona-d1-'));mf=runtime();db=await mf.getD1Database('DB') as unknown as D1Database;for(const migration of (await readdir(new URL('../drizzle/',import.meta.url))).filter(p=>p.endsWith('.sql')).sort()){const sql=await readFile(new URL('../drizzle/'+migration,import.meta.url),'utf8');for(const q of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(q).run();if(migration.startsWith('0000_'))await db.prepare('INSERT INTO sessions (id,read_hash,write_hash,nickname,created_at,expires_at,report) VALUES (?1,?2,?3,?4,?5,?6,?7)').bind(legacy.id,await hash(legacy.readToken),await hash(legacy.writeToken),legacy.nickname,now,legacy.expiresAt,JSON.stringify({legacy:true})).run();}});
after(async()=>{await mf.dispose();await rm(directory,{recursive:true,force:true});});
function request(path:string,method:string,token?:string,payload?:unknown,extra:Record<string,string>={}){return new Request(origin+path,{method,headers:{'content-type':'application/json',...(method==='POST' && path==='/api/sessions' || method==='DELETE' ? {origin} : {}),...(token ? {authorization:`Bearer ${token}`} : {}),...extra},...(payload===undefined?{}:{body:JSON.stringify(payload)})});}
async function create(extra:Record<string,string>={},profile:unknown={nickname:'測試旅人'}){const r=await handleSession(db,request('/api/sessions','POST',undefined,{...(profile as object),protocolVersion:'2.0'},extra),undefined,'session',now);assert.equal(r.status,201);return await r.json() as Session;}
const get=(s:Session,token=s.readToken,at=now,extra:Record<string,string>={})=>handleSession(db,request(`/api/sessions/${s.id}`,'GET',token,undefined,extra),s.id,'session',at);
const send=(s:Session,payload:unknown=makeFixture(s.nickname),key='same-safe-retry-key',token=s.writeToken,at=now)=>handleSession(db,request(`/api/collect/${s.id}`,'POST',token,payload,{'idempotency-key':key}),s.id,'collect',at);

test('migration preserves an existing legacy row and requires reassessment; owner may delete',async()=>{
  const row=await db.prepare("SELECT protocol_version,report FROM sessions WHERE id=?1").bind(legacy.id).first<{protocol_version:string;report:string}>();
  assert.equal(row!.protocol_version,'1.0');assert.equal(row!.report,JSON.stringify({legacy:true}));
  const r=await get(legacy);assert.equal(r.status,410);assert.equal((await r.json() as {code:string}).code,'reassessment_required');
  assert.equal((await send(legacy)).status,410);assert.equal((await get(legacy,legacy.writeToken)).status,404);
  const unchanged=await db.prepare("SELECT report FROM sessions WHERE id=?1").bind(legacy.id).first<{report:string}>();
  assert.equal(unchanged!.report,JSON.stringify({legacy:true}));
  assert.equal((await handleSession(db,request('/api/sessions/'+legacy.id,'DELETE',legacy.readToken),legacy.id,'session',now)).status,200);
});
test('create → submit → read persists aggregates, not email or bearer tokens in report',async()=>{const s=await create({}, {nickname:'測試旅人',email:'fixture@example.test',emailResultOnlyConsent:true});assert.notEqual(s.readToken,s.writeToken);assert.equal(s.expiresAt,now+TTL_MS);assert.equal((await send(s)).status,201);const r=await get(s);assert.equal(r.status,200);assert.match(r.headers.get('cache-control')! ,/no-store/);const data=await r.text();assert.match(data,/INTJ/);assert.doesNotMatch(data,/fixture@example|readToken|writeToken/);const stored=await db.prepare('SELECT read_hash,write_hash FROM sessions WHERE id=?1').bind(s.id).first<{read_hash:string;write_hash:string}>();assert.notEqual(stored!.read_hash,s.readToken);assert.notEqual(stored!.write_hash,s.writeToken);});
test('email gates the full report on the server; nickname-only session receives only card fields',async()=>{const s=await create();await send(s);const data=await(await get(s)).json() as Record<string,unknown>;assert.equal(data.report,null);assert.equal(data.reportAccess,'card_only');assert.equal(data.delivery,'not_requested');assert.deepEqual(Object.keys(data.card as object).sort(),['assessment','kind','modelFamily','nickname']);assert.doesNotMatch(JSON.stringify(data),/humanSessions|observedPeriod|tasks|observations|inputTokens|email/);const t=await create({}, {nickname:'報告旅人',email:'report@example.test',emailResultOnlyConsent:true});await send(t);const full=await(await get(t)).json() as Record<string,unknown>;assert.equal(full.reportAccess,'email');assert.equal(full.delivery,'not_configured');assert.ok(full.report);assert.doesNotMatch(JSON.stringify(full),/report@example/);});
test('separate authorities and cross-session capabilities',async()=>{const a=await create(),b=await create();assert.equal((await get(a,a.writeToken)).status,404);assert.equal((await send(a,makeFixture(a.nickname),'same-safe-retry-key',a.readToken)).status,404);assert.equal((await get(a,b.readToken)).status,404);assert.equal((await send(a,makeFixture(a.nickname),'same-safe-retry-key',b.writeToken)).status,404);});
test('dispatch owner binds reading without requiring callback caller identity',async()=>{const s=await create({'oai-authenticated-user-id':'owner-a'});assert.equal((await send(s)).status,201);assert.equal((await get(s)).status,404);assert.equal((await get(s,s.readToken,now,{'oai-authenticated-user-id':'owner-b'})).status,404);assert.equal((await get(s,s.readToken,now,{'oai-authenticated-user-id':'owner-a'})).status,200);});
test('one submission and exact canonical idempotent retry',async()=>{const s=await create();const f=makeFixture(s.nickname);assert.equal((await send(s,f)).status,201);assert.deepEqual(await (await send(s,Object.fromEntries(Object.entries(f).reverse()))).json(),{accepted:true,duplicate:true});assert.equal((await send(s,f,'another-retry-key')).status,409);f.metrics.humanSessions=19;assert.equal((await send(s,f)).status,409);});
test('concurrent independent payloads cannot overwrite each other',async()=>{const s=await create();const second=makeFixture(s.nickname);second.metrics.userMessages=87;const responses=await Promise.all([send(s),send(s,second,'another-retry-key')]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);});
test('expired pending and submitted sessions reject callback and read, then purge',async()=>{const s=await create();assert.equal((await send(s,makeFixture(s.nickname),'same-safe-retry-key',s.writeToken,now+TTL_MS+1)).status,410);assert.equal((await get(s)).status,404);const t=await create();await send(t);assert.equal((await get(t,t.readToken,now+TTL_MS+1)).status,410);});
test('revoke deletes profile and report; old authority no longer works',async()=>{const s=await create();await send(s);const r=await handleSession(db,request(`/api/sessions/${s.id}`,'DELETE',s.readToken),s.id,'session',now);assert.equal(r.status,200);assert.equal((await get(s)).status,404);assert.equal((await send(s)).status,404);});
test('invalid, oversized, unknown fields, wrong nickname and missing approval reject',async()=>{const s=await create();assert.equal((await send(s,{...makeFixture(s.nickname),raw:'private'})).status,422);const f=makeFixture(s.nickname);f.consent.aggregateUploadApproved=false as true;assert.equal((await send(s,f)).status,422);assert.equal((await send(s,makeFixture('另一個人'))).status,422);assert.equal((await send(s,{raw:'x'.repeat(25000)})).status,413);const invalid=new Request(origin+`/api/collect/${s.id}`,{method:'POST',headers:{authorization:`Bearer ${s.writeToken}`,'content-type':'application/json','idempotency-key':'same-safe-retry-key'},body:'{broken'});assert.equal((await handleSession(db,invalid,s.id,'collect',now)).status,400);assert.equal((await send(s)).status,201);});
test('origin and PII purpose restrictions',async()=>{assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{nickname:'測試'},{origin:'https://other.test'}),undefined,'session',now)).status,403);assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{protocolVersion:'2.0',nickname:'測試',email:'fixture@example.test'}),undefined,'session',now)).status,400);assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{protocolVersion:'2.0',nickname:'a@b.test'}),undefined,'session',now)).status,400);const s=await create();const bad=request(`/api/collect/${s.id}`,'POST',s.writeToken,makeFixture(s.nickname),{origin:'https://other.test','idempotency-key':'same-safe-retry-key'});assert.equal((await handleSession(db,bad,s.id,'collect',now)).status,403);});
test('D1 survives runtime restart and preserves authority and report',async()=>{const s=await create();await send(s);await mf.dispose();mf=runtime();db=await mf.getD1Database('DB') as unknown as D1Database;assert.equal((await get(s)).status,200);assert.equal((await send(s)).status,200);});


test('new sessions require explicit current protocol; old clients cannot submit old semantics',async()=>{
  assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{nickname:'測試'}),undefined,'session',now)).status,400);
  const s=await create();const row=await db.prepare("SELECT protocol_version FROM sessions WHERE id=?1").bind(s.id).first<{protocol_version:string}>();
  assert.equal(row!.protocol_version,'2.0');
  assert.equal((await send(s,{...makeFixture(s.nickname),version:'1.0'})).status,422);
});

test('unexpected storage errors return 503 with diagnostic phase only, never payload or credentials',async()=>{
  const messages:string[]=[];const warn=console.warn;console.warn=(message)=>messages.push(String(message));
  try{
    const broken={prepare(){throw new Error('secret-payload-fixture@example.test');}} as unknown as D1Database;
    const r=await handleSession(broken,request('/api/sessions','POST',undefined,{protocolVersion:'2.0',nickname:'診斷範例'}),undefined,'session',now);
    assert.equal(r.status,503);assert.deepEqual(messages.map(s=>JSON.parse(s)),[{event:'session_unavailable',phase:'create_session',errorClass:'Error'}]);
    assert.doesNotMatch(await r.text(),/secret-payload|fixture@example|prepare/);
  }finally{console.warn=warn;}
});

test('progress uses only write authority, records observed stages and never extends expiry',async()=>{
  const s=await create();
  const push=(payload:unknown,at=now,token=s.writeToken)=>handleSession(db,request('/api/collect/'+s.id+'/status','POST',token,payload),s.id,'progress',at);
  const event={sequence:1,phase:'analyzing',approvalKind:null};
  assert.equal((await push(event,now,s.readToken)).status,404);
  assert.equal((await push({...event,raw:'forbidden'})).status,422);
  assert.equal((await push({...event,approvalKind:'network'})).status,422);
  assert.equal((await push({sequence:1,phase:'awaiting_host_approval',approvalKind:null})).status,422);
  assert.equal((await push(event)).status,200);
  assert.deepEqual(await(await push(event,now+60000)).json(),{accepted:true,duplicate:true});
  let value=await(await get(s)).json() as {expiresAt:number;progress:{phase:string;updatedAt:number;sequence:number;approvalKind:string|null}};
  assert.equal(value.expiresAt,s.expiresAt);assert.equal(value.progress.updatedAt,now);
  assert.equal((await push({...event,phase:'validating'},now+60000)).status,409);
  assert.equal((await push({sequence:3,phase:'awaiting_host_approval',approvalKind:'network'},now+61000)).status,200);
  assert.equal((await push({sequence:2,phase:'validating',approvalKind:null},now+62000)).status,409);
  value=await(await get(s)).json() as typeof value;assert.equal(value.progress.phase,'awaiting_host_approval');assert.equal(value.progress.approvalKind,'network');
  assert.equal((await push({sequence:4,phase:'validating',approvalKind:null},s.expiresAt)).status,410);
});
test('late progress cannot overwrite a completed result or claim completion before accepted submission',async()=>{
  const s=await create();
  const push=(payload:unknown)=>handleSession(db,request('/api/collect/'+s.id+'/status','POST',s.writeToken,payload),s.id,'progress',now);
  assert.equal((await push({sequence:1,phase:'complete',approvalKind:null})).status,422);
  await push({sequence:1,phase:'awaiting_host_approval',approvalKind:'command'});await send(s);
  assert.deepEqual(await(await push({sequence:2,phase:'analyzing',approvalKind:null})).json(),{accepted:true,complete:true});
  const data=await(await get(s)).json() as {progress:{phase:string;approvalKind:string|null}};
  assert.equal(data.progress.phase,'complete');assert.equal(data.progress.approvalKind,null);
});
test('automatic runner tolerates a lost accepted response and renews only after explicit destination authorization',async()=>{
  const {submitAuthorizedSummary}=await import('../lib/collector-runner.ts');
  const s=await create();const sample=makeFixture(s.nickname);
  const target={origin,id:s.id,writeToken:s.writeToken,expiresAt:s.expiresAt,nickname:s.nickname};
  const grant={scopeApproved:true as const,sourceOwnershipConfirmed:true as const,origin,sessionId:s.id,expiresAt:s.expiresAt,nickname:s.nickname,sources:sample.coverage.sources,period:sample.observedPeriod};
  let sends=0;
  const result=await submitAuthorizedSummary(sample,grant,target,'lost-ack-integration',{now:()=>now,wait:async()=>{},fetcher:async(url,init)=>{
    const response=await handleSession(db,new Request(url,init),s.id,'collect',now);sends++;
    if(sends===1){assert.equal(response.status,201);throw new TypeError('lost acknowledgement');}
    return response;
  }});
  assert.deepEqual(result,{status:'accepted',duplicate:true});assert.equal(sends,2);
  assert.equal((await get(s,s.readToken,s.expiresAt)).status,410);
  const freshResponse=await handleSession(db,request('/api/sessions','POST',undefined,{nickname:s.nickname,protocolVersion:'2.0'}),undefined,'session',s.expiresAt);
  const fresh=await freshResponse.json() as Session;
  const renewed={origin,id:fresh.id,writeToken:fresh.writeToken,expiresAt:fresh.expiresAt,nickname:fresh.nickname};
  const transport={now:()=>s.expiresAt,fetcher:async(url:URL|RequestInfo,init?:RequestInit)=>handleSession(db,new Request(url,init),fresh.id,'collect',s.expiresAt)};
  await assert.rejects(()=>submitAuthorizedSummary(sample,grant,renewed,'renewed-integration',transport));
  assert.equal((await submitAuthorizedSummary(sample,{...grant,sessionId:fresh.id,expiresAt:fresh.expiresAt},renewed,'renewed-integration',transport)).status,'accepted');
  assert.equal((await get(fresh,fresh.readToken,s.expiresAt)).status,200);
});
