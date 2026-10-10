import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {makeLevelFixture} from '../lib/fixture.ts';

const origin='https://agent-mbti-cards.dnplus.chatgpt.site';
const nickname='Published Fixture';
const checks=[];
const evidence=new URL('../evidence/published/',import.meta.url);
const check=(step,actual,expected)=>{checks.push({step,actual,expected,passed:actual===expected});assert.equal(actual,expected,step);};
const input=await new Promise((resolve,reject)=>{
 let value='';
 const finish=error=>{process.stdin.removeListener('data',data);if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();error?reject(error):resolve(value.trim());};
 const data=chunk=>{value+=chunk;if(value.includes('\u0003'))finish(new Error('Cancelled'));else if(value.length>65536)finish(new Error('Input too large'));else if(/[\r\n]/.test(value))finish();};
 if(process.stdin.isTTY)process.stdin.setRawMode(true);
 process.stdin.setEncoding('utf8');process.stdin.on('data',data);process.stderr.write('External collector ready. Paste the dedicated fixture instructions as one JSON string; input is hidden.\n');
});
let failure=null;
try{
 const instructions=JSON.parse(input);assert.equal(typeof instructions,'string');assert.ok(instructions.includes(JSON.stringify(nickname)));
 const endpoint=instructions.match(/https:\/\/agent-mbti-cards\.dnplus\.chatgpt\.site\/api\/collect\/[0-9a-f-]{36}/)?.[0];
 const token=instructions.match(/Authorization: Bearer ([0-9a-f]{64})/)?.[1];
 assert.ok(endpoint&&token);assert.equal(new URL(endpoint).origin,origin);
 const call=(suffix,body,overrides={})=>fetch(endpoint+suffix,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key,...overrides},body:typeof body==='string'?body:JSON.stringify(body)});
 const key=randomUUID(),payload=makeLevelFixture(nickname);
 check('native owner still required for private read',(await fetch(endpoint.replace('/api/collect/','/api/sessions/'),{redirect:'manual',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)})).status,401);
 check('malformed JSON rejected',(await call('','{')).status,400);
 check('unsupported field rejected',(await call('',{...payload,rawConversation:'DISPOSABLE INVALID FIXTURE'})).status,422);
 check('oversized payload rejected',(await call('',' '.repeat(24577))).status,413);
 check('wrong content type rejected',(await call('',payload,{'Content-Type':'text/plain'})).status,415);
 check('invalid idempotency key rejected',(await call('',payload,{'Idempotency-Key':'short'})).status,400);
 check('unapproved upload rejected',(await call('',{...payload,consent:{localAnalysisApproved:true,aggregateUploadApproved:false}})).status,422);
 check('minimal progress accepted',(await call('/status',{sequence:1,phase:'analyzing',approvalKind:null})).status,200);
 check('progress retry idempotent',(await call('/status',{sequence:1,phase:'analyzing',approvalKind:null})).status,200);
 check('external scoped callback accepted',(await call('',payload)).status,201);
 const retry=await call('',payload);check('exact retry accepted',retry.status,200);check('retry marked duplicate',(await retry.json()).duplicate,true);
 check('different retry conflicts',(await call('',payload,{'Idempotency-Key':randomUUID()})).status,409);
}catch(error){failure={name:error.name,message:error.message};process.exitCode=1;}
await mkdir(evidence,{recursive:true});
await writeFile(new URL('external-collector.json',evidence),JSON.stringify({origin,checkedAt:new Date().toISOString(),scope:'Actual external Node HTTP calls with only the dedicated 30-minute write capability; no Cookie, native identity headers or Site bypass key; fixture data only',checks,failure},null,2)+'\n');
console.log(JSON.stringify({checks:checks.length,passed:checks.filter(c=>c.passed).length,failure}));
