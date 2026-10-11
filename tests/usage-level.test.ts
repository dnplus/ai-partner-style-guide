import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFixture,makeLevelFixture} from '../lib/fixture.ts';
import {deriveUsageLevel,nextStepFor,nextSteps} from '../lib/usage-level.ts';
import {validateSubmission} from '../lib/assessment.ts';
import type {Submission} from '../lib/contract.ts';
const now=Date.parse('2026-10-10T12:00:00Z');
type System=NonNullable<Submission['systemEvidence']>;
function signals(list:NonNullable<Submission['usageEvidence']>['observations']){const data=makeFixture();data.usageEvidence={version:'usage-level-v2',observations:list};return data;}
const maintained:System={automationSessions:3,subagentSessions:0,automationSpanDays:14,assetWriteSessions:1,assetReuseSessions:2,assetMaintainedAfterAutomation:1,gearKinds:1,filesScanned:12,filesListed:30};
function withSystem(change:Partial<System>){const data=makeLevelFixture();data.systemEvidence={...maintained,...change};return data;}
test('missing usage evidence never becomes LV0 and MBTI/token/client cannot fill it',()=>{const f=makeFixture();f.metrics.humanSessions=1000000;assert.equal(deriveUsageLevel(f).value,null);f.metrics.inputTokens=99999999;assert.deepEqual(deriveUsageLevel(f),{version:'usage-level-v2',value:null,basis:null});});
test('LV0–3 require direct, independent outcome facts',()=>{
 assert.equal(deriveUsageLevel(signals([{task:'T001',signal:'unchecked_adoption'}])).value,0);
 assert.equal(deriveUsageLevel(signals([{task:'T001',signal:'retry_after_error'}])).value,1);
 const two=signals([{task:'T001',signal:'useful_result_verified'},{task:'T002',signal:'useful_result_verified'}]);assert.equal(deriveUsageLevel(two).value,2);two.usageEvidence!.observations[1].task='T001';assert.equal(deriveUsageLevel(two).value,null);
 assert.deepEqual(deriveUsageLevel(signals([{task:'T001',signal:'context_scoped'},{task:'T001',signal:'acceptance_defined'},{task:'T001',signal:'targeted_correction_verified'}])),{version:'usage-level-v2',value:3,basis:'scoped_correction'});
 assert.equal(deriveUsageLevel(signals([{task:'T001',signal:'context_scoped'},{task:'T001',signal:'acceptance_defined'},{task:'T002',signal:'targeted_correction_verified'}])).value,null);
});
test('LV4 needs one asset write and two sessions reusing assets, otherwise the human lens decides',()=>{
 assert.deepEqual(deriveUsageLevel(makeLevelFixture()),{version:'usage-level-v2',value:4,basis:'reused_assets'});
 assert.deepEqual(deriveUsageLevel(withSystem({assetReuseSessions:1})),{version:'usage-level-v2',value:2,basis:'verified_results'});
 assert.equal(deriveUsageLevel(withSystem({assetWriteSessions:0})).value,2);
 assert.equal(deriveUsageLevel(withSystem({assetReuseSessions:null})).value,2);
 const systemOnly=withSystem({automationSessions:0});delete systemOnly.usageEvidence;assert.equal(deriveUsageLevel(systemOnly).value,4);
});
test('LV5 needs reuse plus three automation sessions over 14 days, a gear, and upkeep after automation began',()=>{
 assert.deepEqual(deriveUsageLevel(withSystem({})),{version:'usage-level-v2',value:5,basis:'maintained_automation'});
 for(const change of [{automationSessions:2},{automationSpanDays:13},{gearKinds:0},{assetMaintainedAfterAutomation:0},{assetMaintainedAfterAutomation:null},{automationSpanDays:null}])assert.equal(deriveUsageLevel(withSystem(change)).value,4,JSON.stringify(change));
 assert.equal(deriveUsageLevel(withSystem({assetReuseSessions:1,automationSessions:40,automationSpanDays:60,gearKinds:4})).value,2);
});
test('absent system evidence, insufficient coverage, and unknown sources fail closed',()=>{
 const absent=makeLevelFixture();delete absent.systemEvidence;delete absent.usageEvidence;assert.equal(deriveUsageLevel(absent).value,null);
 const insufficient=withSystem({});insufficient.coverage.scope='insufficient';assert.equal(deriveUsageLevel(insufficient).value,null);
 const unknown=makeLevelFixture();delete unknown.systemEvidence;unknown.tasks=unknown.tasks.map(t=>({...t,source:'unknown' as const}));assert.equal(deriveUsageLevel(unknown).value,null);
});
test('the summary accepts system evidence only as bounded counts',()=>{
 assert.deepEqual(validateSubmission(withSystem({}),now).systemEvidence,maintained);
 assert.throws(()=>validateSubmission({...withSystem({}),systemEvidence:{...maintained,path:'/Users/ada/scripts/sync.sh'}},now));
 assert.throws(()=>validateSubmission(withSystem({assetReuseSessions:-1}),now));
 assert.throws(()=>validateSubmission(withSystem({gearKinds:5}),now));
 assert.throws(()=>validateSubmission(withSystem({filesScanned:31}),now));
 assert.throws(()=>validateSubmission({...makeLevelFixture(),usageEvidence:{version:'usage-level-v2',observations:[{task:'T001',signal:'artifact_reused',artifact:'A01'}]}},now));
 assert.throws(()=>validateSubmission({...makeLevelFixture(),usageEvidence:{version:'usage-level-v1',observations:[]}},now));
 assert.throws(()=>validateSubmission({...makeLevelFixture(),usageEvidence:{version:'usage-level-v2',raw:'private',observations:[]}},now));
 assert.throws(()=>validateSubmission({...makeLevelFixture(),usageEvidence:{version:'usage-level-v2',observations:[{task:'T024',signal:'retry_after_error'}]}},now));
});

test('every level, and an unknown one, names a distinct next step',()=>{
 const steps=[null,0,1,2,3,4,5].map(value=>nextStepFor({version:'usage-level-v2',value,basis:null}));
 assert.equal(new Set(steps).size,7);
 assert.equal(nextStepFor({version:'usage-level-v2',value:null,basis:null}),nextSteps.unknown);
 assert.equal(nextStepFor({version:'usage-level-v2',value:3,basis:'scoped_correction'}),nextSteps[3]);
});
