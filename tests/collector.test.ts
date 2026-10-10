import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareCollectorReview} from '../lib/collector-review.ts';
import {makeFixture} from '../lib/fixture.ts';

test('local review recalculates assessment and never grants upload consent',()=>{const sample=makeFixture('測試旅人');const draft={...sample,assessment:{level:'LV5',type:'QAOC'},consent:{localAnalysisApproved:true,aggregateUploadApproved:false}};const review=prepareCollectorReview(draft);assert.deepEqual(review.assessment,{level:'LV4+',type:'PVSE'});assert.equal(review.consent.aggregateUploadApproved,false);assert.equal(review.kind,'fixture');});
test('review refuses missing local permission, already-approved data and extra raw fields',()=>{const sample=makeFixture('測試旅人');assert.throws(()=>prepareCollectorReview({...sample,consent:{localAnalysisApproved:false,aggregateUploadApproved:false}}));assert.throws(()=>prepareCollectorReview(sample));assert.throws(()=>prepareCollectorReview({...sample,consent:{localAnalysisApproved:true,aggregateUploadApproved:false},raw:'private'}));});
test('zero available evidence remains unknown, not provisional LV4+ or PVSE',async()=>{const input=JSON.parse(await readFile(new URL('../fixtures/insufficient-evidence.json',import.meta.url),'utf8'));input.consent={localAnalysisApproved:true,aggregateUploadApproved:false};const review=prepareCollectorReview(input);assert.deepEqual(review.assessment,{level:'unknown',type:'????'});assert.equal(review.metrics.inputTokens,null);assert.equal(review.metrics.mostUsedModelFamily,'unknown');});
