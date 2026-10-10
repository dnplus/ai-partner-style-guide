import test from 'node:test';
import assert from 'node:assert/strict';
import {createCollectorScope,defaultScopeOptions,withinCollectorScope,scopeDateBounds,collectorScopeSchema} from '../lib/collector-scope.ts';
import {collectorConfirmation,collectorInstructions} from '../lib/collector-instructions.ts';
import {COLLECTOR_SCRIPT_SHA256} from '../lib/collector-script-hash.ts';
import {locales} from '../lib/i18n.ts';
import {grantPopulatedScope,prepareAuthorizedSummary} from '../lib/collector-runner.ts';
import {makeFixture} from '../lib/fixture.ts';
const now=Date.parse('2026-10-10T12:00:00Z');
const target={origin:'http://127.0.0.1:5188',id:'00000000-0000-4000-8000-000000000051',writeToken:'b'.repeat(64),expiresAt:now+1800000,nickname:'Scope Fixture'};
test('defaults fill all supported owned sources and Tokscale for 60 local days',()=>{
 const scope=createCollectorScope(now,'Asia/Taipei');assert.equal(scope.from,'2026-08-11T16:00:00.000Z');assert.equal(scope.to,'2026-10-10T12:00:00.000Z');assert.deepEqual(scopeDateBounds(scope),{from:'2026-08-12',to:'2026-10-10'});assert.equal(scope.options.sourceMode,'all_supported_local');assert.equal(scope.options.sources.length,6);assert.equal(scope.options.includeTokscale,true);assert.equal(scope.options.installTokscaleIfMissing,true);
 assert.equal(withinCollectorScope(scope.from,scope),true);assert.equal(withinCollectorScope(scope.to,scope),false);assert.equal(withinCollectorScope(Date.parse(scope.from)-1,scope),false);assert.equal(withinCollectorScope('unparseable',scope),false);
 const rolling={...scope,from:new Date(now-60*86400000).toISOString()};assert.equal(collectorScopeSchema.safeParse(rolling).success,false);
});
test('DST and timezone boundaries keep whole local days',()=>{
 for(const [date,zone,from,to,bounds] of [['2026-03-09T00:30:00Z','America/New_York','2026-01-08T05:00:00.000Z','2026-03-09T00:30:00.000Z',{from:'2026-01-08',to:'2026-03-08'}],['2026-11-02T00:30:00Z','America/New_York','2026-09-03T04:00:00.000Z','2026-11-02T00:30:00.000Z',{from:'2026-09-03',to:'2026-11-01'}],['2026-10-10T18:00:00Z','Asia/Taipei','2026-08-12T16:00:00.000Z','2026-10-10T18:00:00.000Z',{from:'2026-08-13',to:'2026-10-11'}],['2026-10-10T16:00:00Z','Asia/Taipei','2026-08-12T16:00:00.000Z','2026-10-10T16:00:00.000Z',{from:'2026-08-13',to:'2026-10-10'}]] as const){const scope=createCollectorScope(Date.parse(date),zone);assert.equal(scope.from,from);assert.equal(scope.to,to);assert.deepEqual(scopeDateBounds(scope),bounds);}
 assert.throws(()=>createCollectorScope(now,'Not/AZone'));
});
test('each actual localized prompt contains populated defaults, one paragraph approval, official install and no secondary questions',()=>{
 for(const locale of locales){const scope=createCollectorScope(now,'Asia/Taipei');const confirmation=collectorConfirmation(scope,locale);const prompt=collectorInstructions({...target,readToken:'DO_NOT_INCLUDE'},target.origin,false,locale,scope);assert.equal(prompt.split('\n').at(-1),confirmation);assert.equal(confirmation.split('\n').length,1);assert.ok(prompt.includes(`from=${scope.from} to=${scope.to} tz=Asia/Taipei sources=${scope.options.sources.join(',')} tokscale=install`),locale);assert.ok(prompt.includes(target.origin+'/collector/SKILL.md'),locale);assert.ok(prompt.includes(target.origin+'/collector/collect.py'),locale);assert.ok(prompt.includes(COLLECTOR_SCRIPT_SHA256),locale);assert.equal(prompt.includes('lookbackDays='),false);assert.equal(prompt.includes('DO_NOT_INCLUDE'),false);assert.ok(!/\{(sources|days|window|confirmation|from|to)\}/.test(prompt));}
 const existing=createCollectorScope(now,'UTC',{...defaultScopeOptions(),installTokscaleIfMissing:false});assert.match(collectorInstructions({...target,readToken:'x'},target.origin,false,'en',existing),/tokscale=existing/);
 const disabled=createCollectorScope(now,'UTC',{...defaultScopeOptions(),includeTokscale:false});assert.match(collectorInstructions({...target,readToken:'x'},target.origin,false,'en',disabled),/tokscale=off/);
});
test('optional source/days/Tokscale changes bind the one grant and cannot expand silently',()=>{
 const options={...defaultScopeOptions(),lookbackDays:15,sourceMode:'selected' as const,sources:['codex'] as const,includeTokscale:false};const scope=createCollectorScope(now,'UTC',{...options,sources:[...options.sources]});assert.equal(scope.options.installTokscaleIfMissing,false);const grant=grantPopulatedScope(scope,target,{scopeApproved:true,sourceOwnershipConfirmed:true});assert.equal(prepareAuthorizedSummary(makeFixture(target.nickname),grant,target,now).nickname,target.nickname);assert.throws(()=>prepareAuthorizedSummary({...makeFixture(target.nickname),metrics:{...makeFixture().metrics,tokenSource:'tokscale'}},grant,target,now));
});
