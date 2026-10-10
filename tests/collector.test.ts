import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {prepareCollectorReview} from "../lib/collector-review.ts";
import {makeFixture} from "../lib/fixture.ts";
import {collectorInstructions} from "../lib/collector-instructions.ts";

test("local review recalculates workstyle and never grants upload consent",()=>{
  const sample=makeFixture("測試搭檔");
  const review=prepareCollectorReview({...sample,assessment:{type:"ENFP",pattern:"ENFP",status:"complete"},consent:{localAnalysisApproved:true,aggregateUploadApproved:false}});
  assert.deepEqual(review.assessment,{type:"INTJ",pattern:"INTJ",status:"complete"});
  assert.equal(review.consent.aggregateUploadApproved,false);assert.equal(review.kind,"fixture");
});
test("review refuses missing local permission, already-approved data and extra raw fields",()=>{
  const sample=makeFixture();
  assert.throws(()=>prepareCollectorReview({...sample,consent:{localAnalysisApproved:false,aggregateUploadApproved:false}}));
  assert.throws(()=>prepareCollectorReview(sample));
  assert.throws(()=>prepareCollectorReview({...sample,consent:{localAnalysisApproved:true,aggregateUploadApproved:false},raw:"private"}));
});
test("zero available evidence stays untyped with null counts",async()=>{
  const input=JSON.parse(await readFile(new URL("../fixtures/insufficient-evidence.json",import.meta.url),"utf8"));
  input.consent={localAnalysisApproved:true,aggregateUploadApproved:false};
  const review=prepareCollectorReview(input);
  assert.deepEqual(review.assessment,{type:null,pattern:"????",status:"incomplete"});
  assert.equal(review.metrics.inputTokens,null);assert.equal(review.metrics.mostUsedModelFamily,"unknown");
});
test("instructions use new protocol, single scope grant and write-only authority",()=>{
  const text=collectorInstructions({id:"fixture-id",nickname:"小星",readToken:"DO_NOT_COPY_READ",writeToken:"WRITE_ONLY",expiresAt:Date.now()+1000},"http://127.0.0.1:5188");
  assert.match(text,/你的 Agent MBTI/);assert.match(text,/version 2.0/);assert.match(text,/aggregateUploadApproved/);assert.match(text,/ownerRequest/);assert.match(text,/WRITE_ONLY/);
  assert.doesNotMatch(text,/DO_NOT_COPY_READ|Raymond|PVSE|LV4/);
});
