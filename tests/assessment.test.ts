import test from "node:test";
import assert from "node:assert/strict";
import { deriveAssessment, validateSubmission, toReport, toCardObservation } from "../lib/assessment.ts";
import { makeFixture, makePartialFixture } from "../lib/fixture.ts";
import { typeCodes, type Submission, type TaskAxes } from "../lib/contract.ts";
import { artFor, families, personas } from "../lib/catalog.ts";

const now=Date.parse("2026-10-10T12:00:00Z");
const unclear:TaskAxes={EI:"unclear",SN:"unclear",TF:"unclear",JP:"unclear"};
function withTasks(rows:Partial<TaskAxes>[]):Submission{
  const f=makeFixture();
  f.tasks=rows.map((axes,i)=>({id:"T"+String(i+1).padStart(3,"0"),date:"2026-10-05",source:"codex",context:"build",axes:{...unclear,...axes}}));
  return validateSubmission(f,now);
}
const eiPicks=(picks:string)=>withTasks([...picks].map(p=>({EI:p==="E"?"E":p==="I"?"I":"unclear"})));

test("three tasks with the same picks give a clear INTJ",()=>{
  assert.deepEqual(deriveAssessment(validateSubmission(makeFixture(),now)),{type:"INTJ",pattern:"INTJ",status:"complete",axes:[
    {axis:"EI",value:"I",strength:"clear"},{axis:"SN",value:"N",strength:"clear"},{axis:"TF",value:"T",strength:"clear"},{axis:"JP",value:"J",strength:"clear"},
  ]});
});
test("each axis is a majority of picks: clear needs two thirds and a margin of two, otherwise lean; ties and fewer than three picks stay unknown",()=>{
  const cases:[string,{value:string;strength:string|null}][]=[
    ["EEE",{value:"E",strength:"clear"}],
    ["EEEI",{value:"E",strength:"clear"}],
    ["IIIIE",{value:"I",strength:"clear"}],
    ["EEEEEEIII",{value:"E",strength:"clear"}],
    ["EEI",{value:"E",strength:"lean"}],
    ["EEEII",{value:"E",strength:"lean"}],
    ["IIIIIEEE",{value:"I",strength:"lean"}],
    ["EEII",{value:"?",strength:null}],
    ["EEEIII",{value:"?",strength:null}],
    ["EE",{value:"?",strength:null}],
    ["",{value:"?",strength:null}],
  ];
  for(const [picks,expected] of cases)assert.deepEqual(deriveAssessment(eiPicks(picks)).axes[0],{axis:"EI",...expected},picks);
});
test("unclear picks never count toward the total or the margin",()=>{
  assert.deepEqual(deriveAssessment(eiPicks("EE.....")).axes[0],{axis:"EI",value:"?",strength:null});
  assert.deepEqual(deriveAssessment(eiPicks("EEE.....")).axes[0],{axis:"EI",value:"E",strength:"clear"});
  assert.deepEqual(deriveAssessment(eiPicks("EEI.....")).axes[0],{axis:"EI",value:"E",strength:"lean"});
});
test("four decided letters form a type even when some only lean",()=>{
  const f=withTasks([{EI:"E",SN:"S",TF:"T",JP:"P"},{EI:"E",SN:"S",TF:"T",JP:"P"},{EI:"I",SN:"S",TF:"T",JP:"J"}]);
  assert.deepEqual(deriveAssessment(f),{type:"ESTP",pattern:"ESTP",status:"complete",axes:[
    {axis:"EI",value:"E",strength:"lean"},{axis:"SN",value:"S",strength:"clear"},{axis:"TF",value:"T",strength:"clear"},{axis:"JP",value:"P",strength:"lean"},
  ]});
});
test("one undecided axis leaves the type null and marks only that letter",()=>{
  assert.deepEqual(deriveAssessment(validateSubmission(makePartialFixture(),now)),{type:null,pattern:"IN?J",status:"incomplete",axes:[
    {axis:"EI",value:"I",strength:"clear"},{axis:"SN",value:"N",strength:"clear"},{axis:"TF",value:"?",strength:null},{axis:"JP",value:"J",strength:"clear"},
  ]});
});
test("all 16 codes are reachable from per-task picks",()=>{
  for(const code of typeCodes){
    const axes={EI:code[0],SN:code[1],TF:code[2],JP:code[3]} as TaskAxes;
    assert.equal(deriveAssessment(withTasks([axes,axes,axes])).type,code);
    assert.ok(personas[code]);
  }
});
test("insufficient coverage and unknown-source tasks stay unknown",()=>{
  const f=makeFixture();f.coverage.scope="insufficient";assert.equal(deriveAssessment(validateSubmission(f,now)).pattern,"????");
  const g=makeFixture();g.coverage.sources=["unknown"];g.metrics.mostUsedClient="unknown";g.tasks=g.tasks.map(t=>({...t,source:"unknown"}));
  assert.equal(deriveAssessment(validateSubmission(g,now)).pattern,"????");
});
test("tokens, client and model family never influence workstyle or art",()=>{
  const f=makeFixture();f.metrics.inputTokens=999999999;f.metrics.outputTokens=999999999;f.metrics.tokenSource="authorized_records";
  f.metrics.modelUsage=[{family:"google",count:100}];f.metrics.mostUsedModelFamily="google";
  assert.equal(deriveAssessment(validateSubmission(f,now)).type,"INTJ");
  for(const family of families)for(const style of ["regular","chibi"] as const) assert.equal(artFor(family.id,"INTJ",style),"/art/mbti/"+family.id+"/intj-"+style+".webp");
});
test("unknown tokens stay null and tied model aggregates stay unknown",()=>{
  const f=makeFixture();f.metrics.inputTokens=100;assert.throws(()=>validateSubmission(f,now));f.metrics.inputTokens=null;
  f.metrics.modelUsage=[{family:"openai",count:2},{family:"anthropic",count:2}];assert.throws(()=>validateSubmission(f,now));f.metrics.mostUsedModelFamily="unknown";assert.equal(validateSubmission(f,now).metrics.mostUsedModelFamily,"unknown");
});
test("the 2.0 shape, behavior observations, client assessments and off-axis picks are rejected",()=>{
  const f=makeFixture();
  const {axes,...bareTask}=f.tasks[0];void axes;
  const old={...f,version:"2.0",tasks:f.tasks.map(({axes,...t})=>{void axes;return t;}),observations:[{id:"O001",task:"T001",behavior:"consolidated_delivery",ownerRequest:"not_specified",opportunity:"both_available"}]};
  assert.throws(()=>validateSubmission(old,now));
  assert.throws(()=>validateSubmission({...f,version:"2.0"},now));
  assert.throws(()=>validateSubmission({...f,observations:[]},now));
  assert.throws(()=>validateSubmission({...f,tasks:[bareTask]},now));
  assert.throws(()=>validateSubmission({...f,assessment:{type:"ENFP",pattern:"ENFP",status:"complete"}},now));
  assert.throws(()=>validateSubmission({...f,tasks:[{...f.tasks[0],axes:{...f.tasks[0].axes,EI:"S"}}]},now));
  assert.throws(()=>validateSubmission({...f,tasks:[{...f.tasks[0],axes:{...f.tasks[0].axes,note:"steered"}}]},now));
  assert.throws(()=>validateSubmission({...f,raw:"private"},now));
  assert.equal(validateSubmission(f,now).version,"3.0");
});
test("task integrity: uniqueness, dates, coverage and future periods",()=>{
  const changes:((f:Submission)=>void)[]=[
    f=>{f.tasks[1].id=f.tasks[0].id;},
    f=>{f.tasks[0].date="2026-09-01";},
    f=>{f.tasks[0].source="cursor";},
    f=>{f.observedPeriod.to="2099-01-01";},
    f=>{f.observedPeriod.from="2026-02-30";},
    f=>{f.usageEvidence={version:"usage-level-v2",observations:[{task:"T024",signal:"retry_after_error"}]};},
  ];
  for(const change of changes){const f=makeFixture();change(f);assert.throws(()=>validateSubmission(f,now));}
});
test("report and card carry the derived assessment, never counts or evidence",()=>{
  const report=toReport(validateSubmission(makeFixture(),now));
  assert.equal(report.rubric,"agent-workstyle-v2");
  const card=toCardObservation(report);
  assert.deepEqual(Object.keys(card).sort(),["assessment","brief","kind","modelFamily","nickname","selfType","usageLevel"]);
  assert.deepEqual(card.brief,["你習慣先把目標想清楚，一次交代完整，之後很少插手。","你多半給目標和方向，路線交給它自己找。"]);
  assert.doesNotMatch(JSON.stringify(card),/tasks|Tokens|period|email|rubric|count/);
});
test("the brief leads with clear letters before lean ones",()=>{
  const f=withTasks([{EI:"E",SN:"S",TF:"F"},{EI:"E",SN:"S",TF:"F"},{EI:"I",SN:"S",TF:"F"}]);
  assert.deepEqual(toCardObservation(toReport(f)).brief,["你給的多是具體做法：檔案、步驟、指令、範例。","你驗收時看感受：語氣、品味、用的人舒不舒服。"]);
});
