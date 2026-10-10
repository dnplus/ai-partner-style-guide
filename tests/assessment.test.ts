import test from "node:test";
import assert from "node:assert/strict";
import { deriveAssessment, inspectAxes, validateSubmission, toReport, toCardObservation } from "../lib/assessment.ts";
import { makeFixture, makePartialFixture } from "../lib/fixture.ts";
import { typeCodes, type Submission, type Behavior } from "../lib/contract.ts";
import { artFor, families, personas } from "../lib/catalog.ts";

const now=Date.parse("2026-10-10T12:00:00Z");
const valid=(f:Submission)=>validateSubmission({...f,assessment:deriveAssessment(f)},now);
test("three independent tasks support the new INTJ workstyle without levels",()=>{
  const f=validateSubmission(makeFixture(),now);
  assert.deepEqual(f.assessment,{type:"INTJ",pattern:"INTJ",status:"complete"});
  assert.equal(new Set(f.tasks.map(t=>t.id)).size,3);
  assert.deepEqual(inspectAxes(f).map(a=>a.eligibleTasks),[3,3,3,3]);
  assert.doesNotMatch(JSON.stringify(toReport(f)),/level|PVSE|Raymond|signals|workflows/);
});
test("all 16 standard codes are reachable with independent visible behavior",()=>{
  const behavior:Record<string,Behavior>={E:"collaborative_iteration",I:"consolidated_delivery",S:"concrete_evidence",N:"pattern_exploration",T:"consistent_criteria",F:"people_context",J:"early_commitment",P:"reversible_experiments"};
  for(const code of typeCodes){
    const f=makeFixture();
    f.observations=f.observations.map((o,i)=>({...o,behavior:behavior[code[i%4]],ownerRequest:behavior[code[i%4]]}));
    assert.equal(valid(f).assessment.type,code);
    assert.ok(personas[code]);
  }
});
test("same task repetitions cannot manufacture three independent situations",()=>{
  const f=makeFixture();f.tasks=f.tasks.slice(0,1);f.observations=f.observations.map(o=>({...o,task:"T001"}));
  assert.deepEqual(valid(f).assessment,{type:null,pattern:"????",status:"incomplete"});
  assert.deepEqual(inspectAxes(f).map(a=>a.eligibleTasks),[1,1,1,1]);
});
test("two independent tasks are insufficient even when they agree",()=>{
  const f=makeFixture();f.tasks=f.tasks.slice(0,2);f.observations=f.observations.filter(o=>o.task!=="T003");
  assert.equal(valid(f).assessment.type,null);
});
test("2:1 leaning is deliberately unresolved near the boundary",()=>{
  const f=makeFixture();f.observations[0]={...f.observations[0],behavior:"collaborative_iteration",ownerRequest:"not_specified"};
  assert.deepEqual(valid(f).assessment,{type:null,pattern:"?NTJ",status:"incomplete"});
  assert.equal(inspectAxes(f)[0].reason,"near_boundary");
});
test("opposing behavior inside one task is mixed, never two votes",()=>{
  const f=makeFixture();f.observations.push({id:"O013",task:"T001",behavior:"collaborative_iteration",ownerRequest:"not_specified",opportunity:"both_available"});
  assert.equal(valid(f).assessment.pattern,"?NTJ");
  assert.deepEqual(inspectAxes(f)[0].mixedTasks,["T001"]);
  assert.equal(inspectAxes(f)[0].eligibleTasks,3);
});
test("3:1 independent tasks reach a direction; 3:2 remains near-boundary",()=>{
  const f=makeFixture();
  for(let i=4;i<=5;i++){
    const id="T00"+i;
    f.tasks.push({id,date:"2026-10-09",source:"codex",context:"writing"});
    f.observations.push({id:"O0"+(i+9),task:id,behavior:"collaborative_iteration",ownerRequest:"not_specified",opportunity:"both_available"});
    assert.equal(valid(f).assessment.pattern,i===4 ? "INTJ" : "?NTJ");
  }
});
test("constrained and unclear choices are excluded from preference",()=>{
  for(const opportunity of ["constrained","unclear"] as const){
    const f=makeFixture();f.observations=f.observations.map(o=>({...o,opportunity}));
    assert.equal(valid(f).assessment.pattern,"????");
    assert.equal(inspectAxes(f)[0].excludedTasks.length,3);
  }
});
test("owner instruction alone and opposite behavior cannot establish a preference",()=>{
  const f=makeFixture();f.observations=f.observations.map(o=>o.behavior==="consolidated_delivery" ? {...o,ownerRequest:"collaborative_iteration"} : o);
  assert.equal(valid(f).assessment.pattern,"?NTJ");
  f.observations=[];assert.equal(valid(f).assessment.pattern,"????");
});
test("owner intent is separately retained; unspecified intent is not invented",()=>{
  const f=makeFixture();f.observations=f.observations.map(o=>({...o,ownerRequest:"unknown"}));
  const report=toReport(valid(f));assert.equal(report.assessment.type,"INTJ");
  assert.ok(report.observations.every(o=>o.ownerRequest==="unknown"));
});
test("partial axes preserve direction but do not emit a forced four-letter type",()=>{
  assert.deepEqual(validateSubmission(makePartialFixture(),now).assessment,{type:null,pattern:"IN?J",status:"incomplete"});
});
test("insufficient coverage and unknown source stay unknown despite claimed behavior",()=>{
  const f=makeFixture();f.coverage.scope="insufficient";assert.equal(valid(f).assessment.pattern,"????");
  f.coverage.scope="partial";f.coverage.sources=["unknown"];f.metrics.mostUsedClient="unknown";f.tasks=f.tasks.map(t=>({...t,source:"unknown"}));
  assert.equal(valid(f).assessment.pattern,"????");
});
test("tokens, client and model family never influence workstyle or art",()=>{
  const f=makeFixture();f.metrics.inputTokens=999999999;f.metrics.outputTokens=999999999;f.metrics.tokenSource="authorized_records";
  f.metrics.modelUsage=[{family:"google",count:100}];f.metrics.mostUsedModelFamily="google";
  assert.equal(valid(f).assessment.type,"INTJ");
  for(const family of families)for(const style of ["regular","chibi"] as const) assert.equal(artFor(family.id,style),"/art/"+family.id+"-portrait-"+style+".png");
});
test("unknown tokens stay null and tied model aggregates stay unknown",()=>{
  const f=makeFixture();f.metrics.inputTokens=100;assert.throws(()=>valid(f));f.metrics.inputTokens=null;
  f.metrics.modelUsage=[{family:"openai",count:2},{family:"anthropic",count:2}];assert.throws(()=>valid(f));f.metrics.mostUsedModelFamily="unknown";assert.equal(valid(f).metrics.mostUsedModelFamily,"unknown");
});
test("raw data, old payloads and forced assessments are rejected",()=>{
  const f=makeFixture();
  assert.throws(()=>validateSubmission({...f,raw:"private"},now));
  assert.throws(()=>validateSubmission({...f,version:"1.0"},now));
  assert.throws(()=>validateSubmission({...f,assessment:{type:"ENFP",pattern:"ENFP",status:"complete"}},now));
  assert.throws(()=>validateSubmission({...f,assessment:{level:"LV4+",type:"PVSE"}},now));
});
test("task and observation integrity: uniqueness, references, dates, owner axis and coverage",()=>{
  const changes:((f:Submission)=>void)[]=[
    f=>{f.tasks[1].id=f.tasks[0].id;},
    f=>{f.observations[1].id=f.observations[0].id;},
    f=>{f.observations[0].task="T024";},
    f=>{f.tasks[0].date="2026-09-01";},
    f=>{f.observations[0].ownerRequest="people_context";},
    f=>{f.tasks[0].source="cursor";},
    f=>{f.observedPeriod.to="2099-01-01";},
    f=>{f.observedPeriod.from="2026-02-30";},
  ];
  for(const change of changes){const f=makeFixture();change(f);assert.throws(()=>valid(f));}
});
test("card projection excludes report evidence, dates and metrics",()=>{
  const card=toCardObservation(toReport(makeFixture()));
  assert.deepEqual(Object.keys(card).sort(),["assessment","kind","modelFamily","nickname"]);
  assert.doesNotMatch(JSON.stringify(card),/observations|tasks|Tokens|period|email|rubric/);
});
