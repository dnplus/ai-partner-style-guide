import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollectorScope,defaultScopeOptions,withinCollectorScope,scopeDateBounds,DAY_MS} from '../lib/collector-scope.ts';
import {collectorConfirmation,collectorInstructions} from '../lib/collector-instructions.ts';
import {locales} from '../lib/i18n.ts';
import {grantPopulatedScope,prepareAuthorizedSummary} from '../lib/collector-runner.ts';
import {makeFixture} from '../lib/fixture.ts';
const now=Date.parse('2026-10-10T12:00:00Z');
const target={origin:'http://127.0.0.1:5188',id:'00000000-0000-4000-8000-000000000051',writeToken:'b'.repeat(64),expiresAt:now+1800000,nickname:'Scope Fixture'};
test('defaults fill all supported owned sources and Tokscale for exact rolling60days',()=>{
 const scope=createCollectorScope(now,'Asia/Taipei');assert.equal(Date.parse(scope.to)-Date.parse(scope.from),60*DAY_MS);assert.equal(scope.options.sourceMode,'all_supported_local');assert.equal(scope.options.sources.length,6);assert.equal(scope.options.includeTokscale,true);assert.equal(scope.options.installTokscaleIfMissing,true);
 assert.equal(withinCollectorScope(scope.from,scope),true);assert.equal(withinCollectorScope(scope.to,scope),false);assert.equal(withinCollectorScope(Date.parse(scope.from)-1,scope),false);assert.equal(withinCollectorScope('unparseable',scope),false);
});
test('DST and timezone boundaries never inflate rolling interval or guess dates',()=>{
 for(const [date,zone,expected] of [['2026-03-09T00:30:00Z','America/New_York',{from:'2026-01-07',to:'2026-03-08'}],['2026-11-02T00:30:00Z','America/New_York',{from:'2026-09-02',to:'2026-11-01'}],['2026-10-10T18:00:00Z','Asia/Taipei',{from:'2026-08-12',to:'2026-10-11'}]] as const){const scope=createCollectorScope(Date.parse(date),zone);assert.equal(Date.parse(scope.to)-Date.parse(scope.from),60*DAY_MS);assert.deepEqual(scopeDateBounds(scope),expected);}
 assert.throws(()=>createCollectorScope(now,'Not/AZone'));
});
test('each actual localized prompt contains populated defaults, one paragraph approval, official install and no secondary questions',()=>{
 for(const locale of locales){const scope=createCollectorScope(now,'Asia/Taipei');const confirmation=collectorConfirmation(scope,locale);const prompt=collectorInstructions({...target,readToken:'DO_NOT_INCLUDE'},target.origin,false,locale,scope);assert.ok(prompt.includes(confirmation));assert.equal(confirmation.split('\n').length,1);for(const word of ['lookbackDays=60','sourceMode=all_supported_local','includeTokscale=true','installTokscaleIfMissing=true','@tokscale/cli@4.18.0','https://registry.npmjs.org','--home','no_tokscale','partial_window',scope.from,scope.to])assert.ok(prompt.includes(word),locale+word);assert.ok(!prompt.includes('DO_NOT_INCLUDE'));assert.ok(!/\{(sources|days|window|confirmation|from|to)\}/.test(prompt));}
});
test('optional source/days/Tokscale changes bind the one grant and cannot expand silently',()=>{
 const options={...defaultScopeOptions(),lookbackDays:15,sourceMode:'selected' as const,sources:['codex'] as const,includeTokscale:false};const scope=createCollectorScope(now,'UTC',{...options,sources:[...options.sources]});assert.equal(scope.options.installTokscaleIfMissing,false);const grant=grantPopulatedScope(scope,target,{scopeApproved:true,sourceOwnershipConfirmed:true});assert.equal(prepareAuthorizedSummary(makeFixture(target.nickname),grant,target,now).nickname,target.nickname);assert.throws(()=>prepareAuthorizedSummary({...makeFixture(target.nickname),metrics:{...makeFixture().metrics,tokenSource:'tokscale'}},grant,target,now));
});
