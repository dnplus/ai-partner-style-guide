import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {makeFixture} from '../lib/fixture.ts';
const origin=process.argv[2]??'http://127.0.0.1:5189';
const target=new URL(origin);
assert.equal(target.protocol,'http:');assert.ok(['127.0.0.1','localhost'].includes(target.hostname));assert.equal(target.origin,origin);
const checks=[];
const call=async(path,init)=>fetch(`${origin}${path}`,{redirect:'error',...init});
const home=await call('/');assert.equal(home.status,200);assert.match(await home.text(),/你的 Agent MBTI/);checks.push({step:'built SSR homepage',status:200});
const created=await call('/api/sessions',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:'2.0',nickname:'產物測試旅人'})});assert.equal(created.status,201);const session=await created.json();checks.push({step:'create durable session',status:201});
const readHeaders={Authorization:`Bearer ${session.readToken}`};
const submitHeaders={Authorization:`Bearer ${session.writeToken}`,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()};
try{
  const pending=await call(`/api/sessions/${session.id}`,{headers:readHeaders});assert.equal((await pending.json()).status,'pending');checks.push({step:'read pending',status:200});
  const denied=await call(`/api/collect/${session.id}`,{method:'POST',headers:{...submitHeaders,...readHeaders},body:JSON.stringify(makeFixture(session.nickname))});assert.equal(denied.status,404);checks.push({step:'read authority cannot submit',status:404});
  const invalid=await call(`/api/collect/${session.id}`,{method:'POST',headers:submitHeaders,body:JSON.stringify({...makeFixture(session.nickname),raw:'forbidden fixture field'})});assert.equal(invalid.status,422);checks.push({step:'reject extra raw field',status:422});
  const progress=await call('/api/collect/'+session.id+'/status',{method:'POST',headers:submitHeaders,body:JSON.stringify({sequence:1,phase:'awaiting_host_approval',approvalKind:'network'})});assert.equal(progress.status,200);checks.push({step:'write-authorized observed host approval signal',status:200});
  const progressRead=await(await call('/api/sessions/'+session.id,{headers:readHeaders})).json();assert.equal(progressRead.progress.phase,'awaiting_host_approval');assert.equal(progressRead.progress.approvalKind,'network');assert.equal(progressRead.expiresAt,session.expiresAt);checks.push({step:'read actual stage without extending expiry',status:200});
  const stale=await call('/api/collect/'+session.id+'/status',{method:'POST',headers:submitHeaders,body:JSON.stringify({sequence:1,phase:'analyzing',approvalKind:null})});assert.equal(stale.status,409);checks.push({step:'conflicting progress cannot overwrite stage',status:409});
  const payload=JSON.stringify(makeFixture(session.nickname));
  const first=await call(`/api/collect/${session.id}`,{method:'POST',headers:submitHeaders,body:payload});assert.equal(first.status,201);checks.push({step:'external local callback without browser Origin',status:201});
  const retry=await call(`/api/collect/${session.id}`,{method:'POST',headers:submitHeaders,body:payload});assert.equal(retry.status,200);assert.equal((await retry.json()).duplicate,true);checks.push({step:'exact retry',status:200});
  const result=await call(`/api/sessions/${session.id}`,{headers:readHeaders});const report=await result.json();assert.equal(report.status,'complete');assert.equal(report.progress.phase,'complete');assert.equal(report.progress.approvalKind,null);assert.deepEqual(report.card.assessment,{type:'INTJ',pattern:'INTJ',status:'complete'});assert.equal(report.report,null);assert.equal(report.reportAccess,'card_only');assert.doesNotMatch(JSON.stringify(report),/metrics|tasks|observations|observedPeriod/);assert.ok(!JSON.stringify(report).includes(session.writeToken));checks.push({step:'nickname-only access receives card without full report',status:200});
  for(const path of ['/collector-protocol.md','/collector-schema.json','/art/mbti/claude/intj-chibi.png']){const asset=await call(path);assert.equal(asset.status,200);await asset.arrayBuffer();checks.push({step:`built static ${path}`,status:200});}
}finally{
  const removed=await call(`/api/sessions/${session.id}`,{method:'DELETE',headers:{...readHeaders,Origin:origin}});assert.equal(removed.status,200);checks.push({step:'revoke dedicated fixture session',status:200});
}
assert.equal((await call(`/api/sessions/${session.id}`,{headers:readHeaders})).status,404);checks.push({step:'revoked capability is invalid',status:404});
const emailCreated=await call('/api/sessions',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:'2.0',nickname:'報告產物旅人',email:'fixture@example.test',emailResultOnlyConsent:true})});assert.equal(emailCreated.status,201);const emailSession=await emailCreated.json();checks.push({step:'create with result-only email consent',status:201});
const emailRead={Authorization:`Bearer ${emailSession.readToken}`};
try{
  const submitted=await call(`/api/collect/${emailSession.id}`,{method:'POST',headers:{Authorization:`Bearer ${emailSession.writeToken}`,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(makeFixture(emailSession.nickname))});assert.equal(submitted.status,201);checks.push({step:'email session callback',status:201});
  const full=await call(`/api/sessions/${emailSession.id}`,{headers:emailRead});const data=await full.json();assert.equal(data.reportAccess,'email');assert.equal(data.report.assessment.type,'INTJ');assert.equal(data.delivery,'not_configured');assert.doesNotMatch(JSON.stringify(data),/fixture@example/);checks.push({step:'full report available, mail explicitly not configured',status:200});
}finally{const deleted=await call(`/api/sessions/${emailSession.id}`,{method:'DELETE',headers:{...emailRead,Origin:origin}});assert.equal(deleted.status,200);checks.push({step:'delete email fixture',status:200});}
const result={runtime:'built Worker / local Wrangler + D1',origin,kind:'fixture',remoteWebhookVerified:false,checks};
await writeFile(new URL('../evidence/art-192/built-worker-smoke.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(`Built Worker smoke passed: ${checks.length} checks; no credentials logged; fixture session deleted.`);
