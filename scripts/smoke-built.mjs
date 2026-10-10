import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeLevelFixture} from '../lib/fixture.ts';
const origin=process.argv[2]??'http://127.0.0.1:5188';
const target=new URL(origin);
assert.equal(target.protocol,'http:');assert.ok(['127.0.0.1','localhost'].includes(target.hostname));assert.equal(target.origin,origin);
const checks=[],identity={'oai-authenticated-user-id':'http-smoke-fixture-owner','oai-authenticated-user-email':'http-smoke@example.test'};
const call=(path,init={})=>fetch(origin+path,{redirect:'error',...init});
const check=(name,expected,status)=>{assert.equal(status,expected);checks.push({step:name,status});};
check('public SSR homepage',200,(await call('/')).status);
check('anonymous cannot create',401,(await call('/api/sessions',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:'2.0',nickname:'Anonymous'})})).status);
check('anonymous cannot recall',401,(await call('/api/remembered')).status);
check('client email is not trusted input',400,(await call('/api/sessions',{method:'POST',headers:{...identity,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:'2.0',nickname:'Rejected Fixture',email:'untrusted@example.test'})})).status);
const created=await call('/api/sessions',{method:'POST',headers:{...identity,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({protocolVersion:'2.0',nickname:'HTTP Fixture',marketingOptIn:false})});check('local dispatch identity fixture creates durable session',201,created.status);const s=await created.json();
const readHeaders={...identity,Authorization:'Bearer '+s.readToken},writeHeaders={Authorization:'Bearer '+s.writeToken,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},payload=JSON.stringify(makeLevelFixture(s.nickname));let cookie;
try{
 check('read capability alone needs native owner',401,(await call('/api/sessions/'+s.id,{headers:{Authorization:'Bearer '+s.readToken}})).status);
 check('different owner cannot read',404,(await call('/api/sessions/'+s.id,{headers:{...readHeaders,'oai-authenticated-user-id':'different-fixture-owner'}})).status);
 const pending=await(await call('/api/sessions/'+s.id,{headers:readHeaders})).json();assert.equal(pending.status,'pending');checks.push({step:'pending result without fabricated progress',status:200});
 check('read authority cannot submit',404,(await call('/api/collect/'+s.id,{method:'POST',headers:{...writeHeaders,Authorization:'Bearer '+s.readToken},body:payload})).status);
 check('unknown raw field rejected',422,(await call('/api/collect/'+s.id,{method:'POST',headers:writeHeaders,body:JSON.stringify({...JSON.parse(payload),raw:'forbidden fixture'})})).status);
 check('bounded observed progress',200,(await call('/api/collect/'+s.id+'/status',{method:'POST',headers:writeHeaders,body:JSON.stringify({sequence:1,phase:'analyzing',approvalKind:null})})).status);
 check('external local callback needs only scoped write authority',201,(await call('/api/collect/'+s.id,{method:'POST',headers:writeHeaders,body:payload})).status);
 const retry=await call('/api/collect/'+s.id,{method:'POST',headers:writeHeaders,body:payload});check('exact idempotent retry',200,retry.status);assert.equal((await retry.json()).duplicate,true);
 check('different retry key rejected',409,(await call('/api/collect/'+s.id,{method:'POST',headers:{...writeHeaders,'Idempotency-Key':crypto.randomUUID()},body:payload})).status);
 const result=await(await call('/api/sessions/'+s.id,{headers:readHeaders})).json();assert.equal(result.report.assessment.type,'INTJ');assert.equal(result.card.usageLevel.value,4);assert.equal(result.card.brief.length,2);assert.equal(result.reportAccess,'email');assert.equal(result.delivery,'not_configured');assert.doesNotMatch(JSON.stringify(result),/http-smoke@example|readToken|writeToken/);checks.push({step:'full native-identity report independent of marketing; no email returned',status:200});
 const remembered=await call('/api/remembered',{method:'POST',headers:{...identity,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({sessionId:s.id,readToken:s.readToken})});check('remember completed result',201,remembered.status);const set=remembered.headers.get('set-cookie');assert.match(set,/HttpOnly/);assert.match(set,/Path=\/api\/remembered/);cookie=set.split(';')[0];
 const recall=await(await call('/api/remembered',{headers:{...identity,Cookie:cookie}})).json();assert.equal(recall.found,true);assert.equal(recall.card.usageLevel.value,4);checks.push({step:'same owner device recall',status:200});
 const wrong=await(await call('/api/remembered',{headers:{...identity,'oai-authenticated-user-id':'another-fixture-owner',Cookie:cookie}})).json();assert.equal(wrong.found,false);checks.push({step:'copied cookie does not authorize another identity',status:200});
 for(const path of ['/collector-protocol.md','/collector-schema.json','/collector-scope-schema.json','/art/mbti/codex/istj-chibi.png']){const asset=await call(path);check('built static '+path,200,asset.status);const bytes=Buffer.from(await asset.arrayBuffer());if(path.endsWith('.png')){const file=await readFile(new URL('../public'+path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(file).digest('hex'));checks.push({step:'served ISTJ chibi SHA256 matches selected manifest bytes',sha256:createHash('sha256').update(bytes).digest('hex')});}}
}finally{
 check('delete fixture session and its saved copy',200,(await call('/api/sessions/'+s.id,{method:'DELETE',headers:{...readHeaders,Origin:origin}})).status);
 if(cookie)check('clear remembered fixture cookie',200,(await call('/api/remembered',{method:'DELETE',headers:{...identity,Origin:origin,Cookie:cookie}})).status);
}
check('deleted read capability invalid',404,(await call('/api/sessions/'+s.id,{headers:readHeaders})).status);
await writeFile(new URL('../evidence/final-card/built-worker-smoke.json',import.meta.url),JSON.stringify({runtime:'built Worker / local Wrangler + D1',kind:'fixture',identity:'explicit local dispatch-header simulation; not real ChatGPT sign-in',remoteWebhookVerified:false,checks},null,2)+'\n');
console.log('Built Worker smoke passed: '+checks.length+' checks; no capabilities logged; dedicated fixtures cleared.');
