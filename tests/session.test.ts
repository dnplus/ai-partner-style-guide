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
async function create(extra:Record<string,string>={},profile:unknown={nickname:'測試旅人'}){const r=await handleSession(db,request('/api/sessions','POST',undefined,{...(profile as object),protocolVersion:'3.0'},extra),undefined,'session',now);assert.equal(r.status,201);return await r.json() as Session;}
const get=(s:Session,token=s.readToken,at=now,extra:Record<string,string>={})=>handleSession(db,request(`/api/sessions/${s.id}`,'GET',token,undefined,extra),s.id,'session',at);
const send=(s:Session,payload:unknown=makeFixture(s.nickname),key='same-safe-retry-key',token=s.writeToken,at=now)=>handleSession(db,request(`/api/collect/${s.id}`,'POST',token,payload,{'idempotency-key':key}),s.id,'collect',at);

test('migration preserves an existing legacy row and requires reassessment; the read holder may delete',async()=>{
  const row=await db.prepare("SELECT protocol_version,report FROM sessions WHERE id=?1").bind(legacy.id).first<{protocol_version:string;report:string}>();
  assert.equal(row!.protocol_version,'1.0');assert.equal(row!.report,JSON.stringify({legacy:true}));
  const r=await get(legacy);assert.equal(r.status,410);assert.equal((await r.json() as {code:string}).code,'reassessment_required');
  assert.equal((await send(legacy)).status,410);assert.equal((await get(legacy,legacy.writeToken)).status,404);
  const unchanged=await db.prepare("SELECT report FROM sessions WHERE id=?1").bind(legacy.id).first<{report:string}>();
  assert.equal(unchanged!.report,JSON.stringify({legacy:true}));
  assert.equal((await handleSession(db,request('/api/sessions/'+legacy.id,'DELETE',legacy.readToken),legacy.id,'session',now)).status,200);
  assert.equal((await get(legacy)).status,404);
});
test('create → submit → read persists aggregates, not bearer tokens in report',async()=>{const s=await create();assert.notEqual(s.readToken,s.writeToken);assert.equal(s.expiresAt,now+TTL_MS);assert.equal((await send(s)).status,201);const r=await get(s);assert.equal(r.status,200);assert.match(r.headers.get('cache-control')! ,/no-store/);const data=await r.text();assert.match(data,/INTJ/);assert.doesNotMatch(data,/readToken|writeToken/);const stored=await db.prepare('SELECT read_hash,write_hash FROM sessions WHERE id=?1').bind(s.id).first<{read_hash:string;write_hash:string}>();assert.notEqual(stored!.read_hash,s.readToken);assert.notEqual(stored!.write_hash,s.writeToken);});
test('the read capability alone returns the full report and nothing account-shaped',async()=>{const s=await create({}, {nickname:'報告旅人'});await send(s);const data=await(await get(s)).json() as Record<string,unknown>;assert.deepEqual(Object.keys(data).sort(),['card','expiresAt','id','progress','report','status']);assert.equal((data.report as {assessment:{type:string}}).assessment.type,'INTJ');assert.deepEqual(Object.keys(data.card as object).sort(),['assessment','brief','kind','modelFamily','nickname','selfType','usageLevel']);assert.doesNotMatch(JSON.stringify(data),/readToken|writeToken/);});
test('separate authorities and cross-session capabilities',async()=>{const a=await create(),b=await create();assert.equal((await get(a,a.writeToken)).status,404);assert.equal((await send(a,makeFixture(a.nickname),'same-safe-retry-key',a.readToken)).status,404);assert.equal((await get(a,b.readToken)).status,404);assert.equal((await send(a,makeFixture(a.nickname),'same-safe-retry-key',b.writeToken)).status,404);});
test('one submission and exact canonical idempotent retry',async()=>{const s=await create();const f=makeFixture(s.nickname);assert.equal((await send(s,f)).status,201);assert.deepEqual(await (await send(s,Object.fromEntries(Object.entries(f).reverse()))).json(),{accepted:true,duplicate:true});assert.equal((await send(s,f,'another-retry-key')).status,409);f.metrics.humanSessions=19;assert.equal((await send(s,f)).status,409);});
test('concurrent independent payloads cannot overwrite each other',async()=>{const s=await create();const second=makeFixture(s.nickname);second.metrics.userMessages=87;const responses=await Promise.all([send(s),send(s,second,'another-retry-key')]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);});
test('expired pending and submitted sessions reject callback and read, then purge',async()=>{const s=await create();assert.equal((await send(s,makeFixture(s.nickname),'same-safe-retry-key',s.writeToken,now+TTL_MS+1)).status,410);assert.equal((await get(s)).status,404);const t=await create();await send(t);assert.equal((await get(t,t.readToken,now+TTL_MS+1)).status,410);});
test('revoke deletes profile and report; old authority no longer works',async()=>{const s=await create();await send(s);const r=await handleSession(db,request(`/api/sessions/${s.id}`,'DELETE',s.readToken),s.id,'session',now);assert.equal(r.status,200);assert.equal((await get(s)).status,404);assert.equal((await send(s)).status,404);});
test('invalid, oversized, unknown fields, wrong nickname and missing approval reject',async()=>{const s=await create();assert.equal((await send(s,{...makeFixture(s.nickname),raw:'private'})).status,422);const f=makeFixture(s.nickname);f.consent.aggregateUploadApproved=false as true;assert.equal((await send(s,f)).status,422);assert.equal((await send(s,makeFixture('另一個人'))).status,422);assert.equal((await send(s,{raw:'x'.repeat(25000)})).status,413);const invalid=new Request(origin+`/api/collect/${s.id}`,{method:'POST',headers:{authorization:`Bearer ${s.writeToken}`,'content-type':'application/json','idempotency-key':'same-safe-retry-key'},body:'{broken'});assert.equal((await handleSession(db,invalid,s.id,'collect',now)).status,400);assert.equal((await send(s)).status,201);});
test('origin and PII purpose restrictions',async()=>{assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{nickname:'測試'},{origin:'https://other.test'}),undefined,'session',now)).status,403);assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{protocolVersion:'3.0',nickname:'測試',email:'fixture@example.test'}),undefined,'session',now)).status,400);assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{protocolVersion:'3.0',nickname:'a@b.test'}),undefined,'session',now)).status,400);const s=await create();const bad=request(`/api/collect/${s.id}`,'POST',s.writeToken,makeFixture(s.nickname),{origin:'https://other.test','idempotency-key':'same-safe-retry-key'});assert.equal((await handleSession(db,bad,s.id,'collect',now)).status,403);});
test('D1 survives runtime restart and preserves authority and report',async()=>{const s=await create();await send(s);await mf.dispose();mf=runtime();db=await mf.getD1Database('DB') as unknown as D1Database;assert.equal((await get(s)).status,200);assert.equal((await send(s)).status,200);});


test('new sessions require explicit current protocol; old clients cannot submit old semantics',async()=>{
  assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{nickname:'測試'}),undefined,'session',now)).status,400);
  const s=await create();const row=await db.prepare("SELECT protocol_version FROM sessions WHERE id=?1").bind(s.id).first<{protocol_version:string}>();
  assert.equal(row!.protocol_version,'3.0');
  assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{nickname:'測試',protocolVersion:'2.0'}),undefined,'session',now)).status,400);
  assert.equal((await send(s,{...makeFixture(s.nickname),version:'1.0'})).status,422);
  assert.equal((await send(s,{...makeFixture(s.nickname),version:'2.0'})).status,422);
});

test('unexpected storage errors return 503 with diagnostic phase only, never payload or credentials',async()=>{
  const messages:string[]=[];const warn=console.warn;console.warn=(message)=>messages.push(String(message));
  try{
    const broken={prepare(){throw new Error('secret-payload-fixture@example.test');}} as unknown as D1Database;
    const r=await handleSession(broken,request('/api/sessions','POST',undefined,{protocolVersion:'3.0',nickname:'診斷範例'}),undefined,'session',now);
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
  const freshResponse=await handleSession(db,request('/api/sessions','POST',undefined,{nickname:s.nickname,protocolVersion:'3.0'}),undefined,'session',s.expiresAt);
  const fresh=await freshResponse.json() as Session;
  const renewed={origin,id:fresh.id,writeToken:fresh.writeToken,expiresAt:fresh.expiresAt,nickname:fresh.nickname};
  const transport={now:()=>s.expiresAt,fetcher:async(url:URL|RequestInfo,init?:RequestInit)=>handleSession(db,new Request(url,init),fresh.id,'collect',s.expiresAt)};
  await assert.rejects(()=>submitAuthorizedSummary(sample,grant,renewed,'renewed-integration',transport));
  assert.equal((await submitAuthorizedSummary(sample,{...grant,sessionId:fresh.id,expiresAt:fresh.expiresAt},renewed,'renewed-integration',transport)).status,'accepted');
  assert.equal((await get(fresh,fresh.readToken,s.expiresAt)).status,200);
});

test('an anonymous visitor creates and reads with capabilities alone; the agent submits with its write token',async()=>{
 const s=await create();
 assert.equal((await handleSession(db,request('/api/sessions/'+s.id,'GET'),s.id,'session',now)).status,404);
 assert.equal((await handleSession(db,request('/api/collect/'+s.id,'POST',s.writeToken,makeFixture(s.nickname),{'idempotency-key':'public-scoped-callback'}),s.id,'collect',now)).status,201);
 assert.equal((await get(s)).status,200);
});
test('the account layer is gone from storage: no owner or email columns, no marketing table',async()=>{
 const columns=async(table:string)=>(await db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{name:string}>()).results.map(c=>c.name);
 for(const column of ['owner_hash','email'])assert.ok(!(await columns('sessions')).includes(column),column);
 for(const column of ['owner_hash','report_access'])assert.ok(!(await columns('remembered_results')).includes(column),column);
 assert.equal(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='marketing_preferences'").first(),null);
 assert.equal((await handleSession(db,request('/api/sessions','POST',undefined,{protocolVersion:'3.0',nickname:'Optin',marketingOptIn:true}),undefined,'session',now)).status,400);
});
test('device recall uses HttpOnly scoped authority, expires and can be cleared',async()=>{
 const {handleRemembered,RESULT_TTL_MS}=await import('../lib/remembered-service.ts');const s=await create();await send(s);
 const remember=()=>handleRemembered(db,request('/api/remembered','POST',undefined,{sessionId:s.id,readToken:s.readToken},{origin}),now);
 const saved=await remember();assert.equal(saved.status,201);const cookie=saved.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Path=\/api\/remembered/);assert.doesNotMatch(cookie,new RegExp(s.readToken+'|'+s.writeToken));
 const recall=(at=now)=>handleRemembered(db,request('/api/remembered','GET',undefined,undefined,{cookie:cookie.split(';')[0]}),at);
 assert.equal((await recall()).status,200);const result=await(await recall(now+TTL_MS+1)).json() as {found:boolean;report:unknown};assert.equal(result.found,true);assert.ok(result.report);
 assert.equal((await(await handleRemembered(db,request('/api/remembered','GET'),now)).json() as {found:boolean}).found,false);
 const duplicate=await handleRemembered(db,request('/api/remembered','POST',undefined,{sessionId:s.id,readToken:s.readToken},{origin,cookie:cookie.split(';')[0]}),now);assert.equal(duplicate.status,200);assert.equal(duplicate.headers.get('set-cookie'),null);
 assert.equal((await(await recall(now+RESULT_TTL_MS+1)).json() as {found:boolean}).found,false);
 const t=await create();await send(t);const second=await handleRemembered(db,request('/api/remembered','POST',undefined,{sessionId:t.id,readToken:t.readToken},{origin}),now);const token=second.headers.get('set-cookie')!.split(';')[0];
 assert.equal((await handleRemembered(db,request('/api/remembered','DELETE',undefined,undefined,{origin,cookie:token}),now)).status,200);assert.equal((await(await handleRemembered(db,request('/api/remembered','GET',undefined,undefined,{cookie:token}),now)).json() as {found:boolean}).found,false);
});

test('self-type is stored beside the session, reaches the card and the remembered copy, and never changes the assessment',async()=>{
 const {handleRemembered}=await import('../lib/remembered-service.ts');
 const put=(s:Session,payload:unknown,token=s.readToken,extra:Record<string,string>={origin})=>handleSession(db,request('/api/sessions/'+s.id,'PUT',token,payload,extra),s.id,'session',now);
 type Read={card:{selfType:string|null;assessment:unknown};report:{assessment:unknown}};
 const plain=await create();await send(plain);
 const guessed=await create();
 assert.deepEqual(await(await put(guessed,{selfType:'ENFP'})).json(),{selfType:'ENFP'});
 assert.equal((await put(guessed,{selfType:'XXXX'})).status,422);
 assert.equal((await put(guessed,{selfType:'ENFP',weight:1})).status,422);
 assert.equal((await put(guessed,{selfType:'ENFP'},guessed.writeToken)).status,404);
 assert.equal((await put(guessed,{selfType:'ENFP'},guessed.readToken,{origin:'https://other.test'})).status,403);
 assert.equal((await send(guessed)).status,201);
 const a=await(await get(plain)).json() as Read,b=await(await get(guessed)).json() as Read;
 assert.equal(a.card.selfType,null);assert.equal(b.card.selfType,'ENFP');
 assert.deepEqual(b.card.assessment,a.card.assessment);assert.deepEqual(b.report.assessment,a.report.assessment);
 assert.equal((b.card.assessment as {type:string}).type,'INTJ');
 assert.doesNotMatch(JSON.stringify(b.report),/ENFP/);
 const saved=await handleRemembered(db,request('/api/remembered','POST',undefined,{sessionId:guessed.id,readToken:guessed.readToken},{origin}),now);const cookie=saved.headers.get('set-cookie')!.split(';')[0];
 const recalled=await(await handleRemembered(db,request('/api/remembered','GET',undefined,undefined,{cookie}),now)).json() as Read;
 assert.equal(recalled.card.selfType,'ENFP');assert.deepEqual(recalled.card.assessment,a.card.assessment);
 assert.deepEqual(await(await put(guessed,{selfType:null})).json(),{selfType:null});
 assert.equal((await(await get(guessed)).json() as Read).card.selfType,null);
});
test('a remembered result from the 2.0 rubric is not reopened',async()=>{
 const {handleRemembered}=await import('../lib/remembered-service.ts');const s=await create();await send(s);
 const saved=await handleRemembered(db,request('/api/remembered','POST',undefined,{sessionId:s.id,readToken:s.readToken},{origin}),now);const cookie=saved.headers.get('set-cookie')!.split(';')[0];
 const recall=async()=>(await(await handleRemembered(db,request('/api/remembered','GET',undefined,undefined,{cookie}),now)).json() as {found:boolean}).found;
 assert.equal(await recall(),true);
 await db.prepare("UPDATE remembered_results SET report=json_set(report,'$.version','2.0') WHERE id=?1").bind(s.id).run();
 assert.equal(await recall(),false);
});
test('clearing beats an in-flight remember insert; explicit new-observation retention keeps only the saved copy',async()=>{
 const {handleRemembered}=await import('../lib/remembered-service.ts');const s=await create();await send(s);
 const racingDb={prepare(sql:string){const statement=db.prepare(sql);if(!sql.startsWith('INSERT INTO remembered_results'))return statement;return {bind(...values:unknown[]){const bound=statement.bind(...values);return {async run(){assert.equal((await handleSession(db,request('/api/sessions/'+s.id,'DELETE',s.readToken,undefined,{origin}),s.id,'session',now)).status,200);return bound.run();}};}};}} as unknown as D1Database;
 const raced=await handleRemembered(racingDb,request('/api/remembered','POST',undefined,{sessionId:s.id,readToken:s.readToken},{origin}),now);assert.equal(raced.status,410);assert.equal(await db.prepare('SELECT id FROM remembered_results WHERE id=?1').bind(s.id).first(),null);
 const t=await create();await send(t);const saved=await handleRemembered(db,request('/api/remembered','POST',undefined,{sessionId:t.id,readToken:t.readToken},{origin}),now);const cookie=saved.headers.get('set-cookie')!.split(';')[0];
 assert.equal((await handleSession(db,request('/api/sessions/'+t.id+'?retainResult=1','DELETE',t.readToken,undefined,{origin}),t.id,'session',now)).status,200);assert.equal((await get(t)).status,404);assert.equal((await(await handleRemembered(db,request('/api/remembered','GET',undefined,undefined,{cookie}),now)).json() as {found:boolean}).found,true);
 assert.equal((await handleRemembered(db,request('/api/remembered','DELETE',undefined,undefined,{origin,cookie}),now)).status,200);assert.equal(await db.prepare('SELECT id FROM remembered_results WHERE id=?1').bind(t.id).first(),null);
});
