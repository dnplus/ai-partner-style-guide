import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {makeFixture} from "../lib/fixture.ts";
import {prepareAuthorizedSummary,reportCollectorProgress,submitAuthorizedSummary,HostApprovalRequired,type CollectorGrant} from "../lib/collector-runner.ts";
import {toReport} from "../lib/assessment.ts";
import {describeProgress,emptyProgress} from "../lib/collector-progress.ts";
import {collectorInstructions} from "../lib/collector-instructions.ts";

const now=Date.parse("2026-10-10T12:00:00Z");
const target={origin:"http://127.0.0.1:5188",id:"00000000-0000-4000-8000-000000000042",writeToken:"b".repeat(64),expiresAt:now+1800000,nickname:"範圍範例"};
const grant:CollectorGrant={scopeApproved:true,sourceOwnershipConfirmed:true,origin:target.origin,sessionId:target.id,expiresAt:target.expiresAt,nickname:target.nickname,sources:["codex"],period:{from:"2026-10-01",to:"2026-10-09"}};
const sample=()=>makeFixture(target.nickname);
const ok=()=>Response.json({accepted:true,duplicate:false},{status:201});

test("one explicit scope grant authorizes derived minimum summary without a second preview gate",()=>{
  const input=sample();input.assessment={type:"ENFP",pattern:"ENFP",status:"complete"};
  const result=prepareAuthorizedSummary(input,grant,target,now);
  assert.equal(result.assessment?.type,"ENFP");assert.equal(toReport(result).assessment.type,"INTJ");assert.deepEqual(result.consent,{localAnalysisApproved:true,aggregateUploadApproved:true});
  assert.throws(()=>prepareAuthorizedSummary(input,{...grant,scopeApproved:false} as unknown as CollectorGrant,target,now));
  assert.throws(()=>prepareAuthorizedSummary({...input,raw:"forbidden"},grant,target,now));
});
test("approved dates, source ownership, source set and destination cannot be silently expanded",()=>{
  for(const g of [{...grant,period:{...grant.period,from:"2026-10-02"}},{...grant,sources:[]},{...grant,sourceOwnershipConfirmed:false}]){
    assert.throws(()=>prepareAuthorizedSummary(sample(),g as CollectorGrant,target,now));
  }
  assert.throws(()=>prepareAuthorizedSummary(sample(),grant,{...target,id:"00000000-0000-4000-8000-000000000043"},now));
  assert.throws(()=>prepareAuthorizedSummary(sample(),grant,{...target,origin:"https://different.example"},now));
});
test("lost acknowledgement and temporary 503 retry exact bytes and key, bounded to three attempts",async()=>{
  const calls:{body:string;key:string|null}[]=[];const waits:number[]=[];
  const result=await submitAuthorizedSummary(sample(),grant,target,"exact-fixture-retry-key",{now:()=>now,wait:async(ms)=>{waits.push(ms);},fetcher:async(_url,init)=>{
    calls.push({body:String(init!.body),key:new Headers(init!.headers).get("Idempotency-Key")});
    assert.equal(init!.redirect,"error");
    if(calls.length===1)throw new TypeError("lost response");
    if(calls.length===2)return new Response(null,{status:503});
    return Response.json({accepted:true,duplicate:true});
  }});
  assert.deepEqual(result,{status:"accepted",duplicate:true});assert.equal(new Set(calls.map(c=>c.body)).size,1);assert.equal(new Set(calls.map(c=>c.key)).size,1);assert.deepEqual(waits,[1000,2000]);
  let n=0;assert.deepEqual(await submitAuthorizedSummary(sample(),grant,target,"exact-fixture-retry-key",{now:()=>now,wait:async()=>{},fetcher:async()=>{n++;throw new TypeError("offline");}}),{status:"unavailable"});assert.equal(n,3);
});
test("actual host approval is distinguished from generic access failure and never retried around",async()=>{
  let n=0;
  const actual=await submitAuthorizedSummary(sample(),grant,target,"host-approval-fixture",{now:()=>now,fetcher:async()=>{n++;throw new HostApprovalRequired("network");}});
  assert.deepEqual(actual,{status:"approval_required",kind:"network"});assert.equal(n,1);
  const blocked=await submitAuthorizedSummary(sample(),grant,target,"host-approval-fixture",{now:()=>now,fetcher:async()=>new Response(null,{status:403})});
  assert.deepEqual(blocked,{status:"blocked"});
});
test("expiry retains prepared summary and requires a new explicit grant to resume without rescanning",async()=>{
  const preserved=prepareAuthorizedSummary(sample(),grant,target,now);const frozen=JSON.stringify(preserved);
  let sends=0;
  assert.deepEqual(await submitAuthorizedSummary(preserved,grant,target,"renewal-fixture-key",{now:()=>target.expiresAt,fetcher:async()=>{sends++;return ok();}}),{status:"expired"});assert.equal(sends,0);
  const renewed={...target,id:"00000000-0000-4000-8000-000000000044",expiresAt:target.expiresAt+1800000};
  await assert.rejects(()=>submitAuthorizedSummary(preserved,grant,renewed,"renewal-fixture-key",{now:()=>target.expiresAt,fetcher:async()=>ok()}));
  const newGrant={...grant,sessionId:renewed.id,expiresAt:renewed.expiresAt};
  assert.equal((await submitAuthorizedSummary(preserved,newGrant,renewed,"renewal-fixture-key",{now:()=>target.expiresAt,fetcher:async()=>ok()})).status,"accepted");
  assert.equal(JSON.stringify(preserved),frozen);
});
test("progress is finite and content-free, approval kind is valid only for actual pending approval",async()=>{
  const send=async(p:unknown)=>reportCollectorProgress(grant,target,p as Parameters<typeof reportCollectorProgress>[2],{now:()=>now,fetcher:async()=>ok()});
  await assert.rejects(()=>send({sequence:1,phase:"analyzing",approvalKind:"network"}));
  await assert.rejects(()=>send({sequence:1,phase:"awaiting_host_approval",approvalKind:null}));
  await assert.rejects(()=>send({sequence:1,phase:"analyzing",approvalKind:null,raw:"forbidden"}));
  assert.equal((await send({sequence:1,phase:"awaiting_host_approval",approvalKind:"network"})).status,"accepted");
});
test("waiting distinguishes no contact, last known stale signal and actual host approval",()=>{
  assert.equal(describeProgress(emptyProgress,now).title,"還沒與 Agent 連上");
  const p={phase:"awaiting_host_approval" as const,sequence:2,updatedAt:now,approvalKind:"network" as const};
  assert.match(describeProgress(p,now+1).details,/原生核准/);
  assert.equal(describeProgress(p,now+90001).title,"暫時沒有新的進度");
  assert.match(describeProgress(p,now+90001).details,/可能仍在處理，也可能已中斷/);
});
test("sanitized AGY control-flow fixture contains no old assessment or actual transcript",async()=>{
  const fixture=JSON.parse(await readFile(new URL("../fixtures/agy-control-flow.json",import.meta.url),"utf8"));
  const data=prepareAuthorizedSummary({...fixture.summary,nickname:target.nickname},{...grant,sources:["antigravity"]},target,now);
  assert.equal(data.kind,"fixture");assert.equal(data.metrics.mostUsedModelFamily,"unknown");assert.equal(data.metrics.mostUsedClient,"antigravity");assert.equal(data.assessment?.type,null);
  assert.doesNotMatch(JSON.stringify(fixture),/Bearer|readToken|writeToken|PVSE|LV5|transcript/);
  assert.deepEqual(fixture.scenario,["scope_granted","prepared","host_approval_pending","session_expired","new_destination_granted","submitted","website_reveal"]);
});
test("readable renewal prompt requires destination grant, preserves analysis and avoids terminal report dump",()=>{
  const text=collectorInstructions({...target,readToken:"NEVER_INCLUDE_READ_AUTHORITY"},target.origin,true);
  assert.match(text,/更換收件連結/);assert.match(text,/明確同意新目的地/);assert.match(text,/不再要求第二次/);assert.match(text,/不要先輸出分型/);assert.match(text,/原生核准/);assert.doesNotMatch(text,/NEVER_INCLUDE_READ_AUTHORITY|先展示完整 JSON/);
});
