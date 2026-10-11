import test from "node:test";
import assert from "node:assert/strict";
import manifest from "../lib/art-manifest.json" with {type:"json"};
import {artSlots,artFor,artCounts,validateArtManifest,artFamilies,artStyles} from "../lib/art-catalog.ts";
import {typeCodes} from "../lib/contract.ts";
import {defaultFamily} from "../lib/catalog.ts";

test("192 unique tuple slots cover six families, sixteen codes and two styles",()=>{
  assert.equal(artSlots.length,192);
  for(const family of artFamilies)for(const type of typeCodes)for(const style of artStyles)assert.equal(artSlots.filter(s=>s.family===family&&s.type===type&&s.style===style).length,1);
});
test("resolver never falls back across type, family, style or unknown assessment",()=>{
  const available=artSlots.filter(s=>s.status==="ready");
  assert.equal(new Set(available.map(s=>artFor(s.family,s.type,s.style))).size,available.length);
  for(const s of artSlots.filter(s=>s.status==="pending"))assert.equal(artFor(s.family,s.type,s.style),null);
  assert.equal(artFor("codex",null,"chibi"),null);
  assert.notEqual(artFor("codex","INTJ","chibi"),artFor("codex","INFJ","chibi"));
});
test("completeness gate cannot count fallback hashes or missing slots as complete",()=>{
  const copy=structuredClone(manifest);const ready=copy.slots.filter(s=>s.status==="ready");
  ready[1].sha256=ready[0].sha256;assert.throws(()=>validateArtManifest(copy),/Repeated fallback/);
  const pending=validateArtManifest(structuredClone(manifest));pending.slots[0]={...pending.slots[0],status:"pending",src:null,sha256:null};
  assert.throws(()=>validateArtManifest(pending,true),/incomplete/);
  if(artCounts.complete)assert.doesNotThrow(()=>validateArtManifest(manifest,true));else assert.throws(()=>validateArtManifest(manifest,true),/incomplete/);
});
test("archive filenames do not appear in rendered paths or affect the workstyle contract",()=>{
  for(const s of artSlots.filter(s=>s.status==="ready"))assert.equal(s.src,"/art/mbti/"+s.family+"/"+s.type.toLowerCase()+"-"+s.style+".webp");
  assert.doesNotMatch(JSON.stringify(manifest),/PVSE|QVSE|PVSC|QASC/);
});

test("the card theme follows the most used model family, then the most used client",()=>{
  assert.equal(defaultFamily("anthropic","codex"),"claude");
  assert.equal(defaultFamily("unknown","claude-code"),"claude");
  assert.equal(defaultFamily("unknown","codex"),"codex");
  assert.equal(defaultFamily("other","antigravity"),"gemini");
  assert.equal(defaultFamily("unknown","cursor"),"codex");
  assert.equal(defaultFamily("unknown"),"codex");
});
