import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {makeFixture} from '../lib/fixture.ts';
const origin=process.argv[2]??'http://127.0.0.1:5189';
const target=new URL(origin);
assert.equal(target.protocol,'http:');assert.ok(['127.0.0.1','localhost'].includes(target.hostname));assert.equal(target.origin,origin);
const checks=[];
const call=async(path,init)=>fetch(`${origin}${path}`,{redirect:'error',...init});
const home=await call('/');assert.equal(home.status,200);assert.match(await home.text(),/AI 人物誌/);checks.push({step:'built SSR homepage',status:200});
const created=await call('/api/sessions',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({nickname:'產物測試旅人'})});assert.equal(created.status,201);const session=await created.json();checks.push({step:'create durable session',status:201});
const readHeaders={Authorization:`Bearer ${session.readToken}`};
const submitHeaders={Authorization:`Bearer ${session.writeToken}`,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()};
try{
  const pending=await call(`/api/sessions/${session.id}`,{headers:readHeaders});assert.equal((await pending.json()).status,'pending');checks.push({step:'read pending',status:200});
  const denied=await call(`/api/collect/${session.id}`,{method:'POST',headers:{...submitHeaders,...readHeaders},body:JSON.stringify(makeFixture(session.nickname))});assert.equal(denied.status,404);checks.push({step:'read authority cannot submit',status:404});
  const invalid=await call(`/api/collect/${session.id}`,{method:'POST',headers:submitHeaders,body:JSON.stringify({...makeFixture(session.nickname),raw:'forbidden fixture field'})});assert.equal(invalid.status,422);checks.push({step:'reject extra raw field',status:422});
  const payload=JSON.stringify(makeFixture(session.nickname));
  const first=await call(`/api/collect/${session.id}`,{method:'POST',headers:submitHeaders,body:payload});assert.equal(first.status,201);checks.push({step:'external local callback without browser Origin',status:201});
  const retry=await call(`/api/collect/${session.id}`,{method:'POST',headers:submitHeaders,body:payload});assert.equal(retry.status,200);assert.equal((await retry.json()).duplicate,true);checks.push({step:'exact retry',status:200});
  const result=await call(`/api/sessions/${session.id}`,{headers:readHeaders});const report=await result.json();assert.equal(report.status,'complete');assert.deepEqual(report.report.assessment,{level:'LV4+',type:'PVSE'});assert.ok(!JSON.stringify(report).includes(session.writeToken));checks.push({step:'read validated report',status:200});
  for(const path of ['/collector-protocol.md','/collector-schema.json','/art/claude-pvse-chibi.png']){const asset=await call(path);assert.equal(asset.status,200);await asset.arrayBuffer();checks.push({step:`built static ${path}`,status:200});}
}finally{
  const removed=await call(`/api/sessions/${session.id}`,{method:'DELETE',headers:{...readHeaders,Origin:origin}});assert.equal(removed.status,200);checks.push({step:'revoke dedicated fixture session',status:200});
}
assert.equal((await call(`/api/sessions/${session.id}`,{headers:readHeaders})).status,404);checks.push({step:'revoked capability is invalid',status:404});
const result={runtime:'built Worker / local Wrangler + D1',origin,kind:'fixture',remoteWebhookVerified:false,checks};
await writeFile(new URL('../evidence/built-worker-smoke.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(`Built Worker smoke passed: ${checks.length} checks; no credentials logged; fixture session deleted.`);
