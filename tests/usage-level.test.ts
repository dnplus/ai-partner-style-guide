import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFixture,makeLevelFixture} from '../lib/fixture.ts';
import {deriveUsageLevel} from '../lib/usage-level.ts';
import {deriveAssessment,validateSubmission} from '../lib/assessment.ts';
import type {Submission} from '../lib/contract.ts';
const now=Date.parse('2026-10-10T12:00:00Z');
function signals(list:NonNullable<Submission['usageEvidence']>['observations']){const data=makeFixture();data.usageEvidence={version:'usage-level-v1',observations:list};return data;}
test('missing usage evidence never becomes LV0 and MBTI/token/client cannot fill it',()=>{const f=makeFixture();f.metrics.humanSessions=1000000;assert.equal(deriveUsageLevel(f).value,null);f.metrics.inputTokens=99999999;assert.equal(deriveUsageLevel(f).value,null);});
test('LV0–3 require direct, independent outcome facts',()=>{
 assert.equal(deriveUsageLevel(signals([{task:'T001',signal:'unchecked_adoption'}])).value,0);
 assert.equal(deriveUsageLevel(signals([{task:'T001',signal:'retry_after_error'}])).value,1);
 const two=signals([{task:'T001',signal:'useful_result_verified'},{task:'T002',signal:'useful_result_verified'}]);assert.equal(deriveUsageLevel(two).value,2);two.usageEvidence!.observations[1].task='T001';assert.equal(deriveUsageLevel(two).value,null);
 assert.equal(deriveUsageLevel(signals(['context_scoped','acceptance_defined','targeted_correction_verified'].map(signal=>({task:'T001',signal})) as NonNullable<Submission['usageEvidence']>['observations'])).value,3);
});
test('LV4 requires an inspected tested artifact reused in a distinct task after testing',()=>{
 const f=makeLevelFixture();assert.equal(deriveUsageLevel(f).value,4);const original=deriveAssessment(f);f.usageEvidence!.observations[1].artifact='A02';assert.equal(deriveUsageLevel(f).value,null);assert.deepEqual(deriveAssessment(f),original);f.usageEvidence!.observations[1].artifact='A01';f.usageEvidence!.observations[2].task='T001';assert.equal(deriveUsageLevel(f).value,null);
 const backdated=makeLevelFixture();backdated.tasks[1].date='2026-09-01';assert.equal(deriveUsageLevel(backdated).value,null);
});
function sustained(){const f=makeLevelFixture();f.observedPeriod={from:'2026-08-12',to:'2026-10-09'};f.observations=[];f.tasks=Array.from({length:6},(_,i)=>({id:'T00'+(i+1),date:['2026-09-01','2026-09-09','2026-09-20'][i%3],source:'codex' as const,context:'build' as const}));for(let w=0;w<2;w++){const workflow='W0'+(w+1);for(let i=0;i<3;i++)f.usageEvidence!.observations.push({task:'T00'+(w*3+i+1),signal:'workflow_operated',workflow});for(const signal of ['roles_defined','acceptance_defined','exceptions_handled','maintenance_verified','feedback_integrated'] as const)f.usageEvidence!.observations.push({task:'T00'+(w*3+3),signal,workflow});}f.assessment=deriveAssessment(f);return f;}
test('LV5 requires sustained disjoint workflows and maintenance, never volume or one workflow',()=>{const f=sustained();assert.equal(validateSubmission(f,now).usageEvidence?.version,'usage-level-v1');assert.equal(deriveUsageLevel(f).value,5);for(const missing of ['maintenance_verified','feedback_integrated','exceptions_handled'] as const){const copy=sustained();copy.usageEvidence!.observations=copy.usageEvidence!.observations.filter(o=>o.signal!==missing);assert.equal(deriveUsageLevel(copy).value,4);}const short=sustained();short.tasks=short.tasks.map(t=>({...t,date:'2026-09-20'}));assert.equal(deriveUsageLevel(short).value,4);const overlap=sustained();overlap.usageEvidence!.observations=overlap.usageEvidence!.observations.map(o=>o.workflow==='W02'?{...o,task:'T00'+(Number(o.task.slice(1))-3)}:o);assert.equal(deriveUsageLevel(overlap).value,4);});
test('unknown sources, insufficient coverage, extra content and broken references fail closed',()=>{const f=makeLevelFixture();f.coverage.scope='insufficient';assert.equal(deriveUsageLevel(f).value,null);assert.throws(()=>validateSubmission({...makeLevelFixture(),usageEvidence:{version:'usage-level-v1',observations:[{task:'T024',signal:'artifact_reused',artifact:'A01'}]}},now));assert.throws(()=>validateSubmission({...makeLevelFixture(),usageEvidence:{version:'usage-level-v1',raw:'private',observations:[]}},now));});
