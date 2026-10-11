import test from "node:test";
import assert from "node:assert/strict";
import { validateSubmission, toReport, toCardObservation } from "../lib/assessment.ts";
import { makeFixture, makePartialFixture } from "../lib/fixture.ts";
import { cardComposition, cardSvg } from "../lib/card-composition.ts";
import { shareText } from "../lib/export-card.ts";
import type { Submission, TaskAxes, TypeCode } from "../lib/contract.ts";

const now=Date.parse("2026-10-10T12:00:00Z");
function estp(selfType:TypeCode|null){
  const f=makeFixture("阿星");
  const picks:TaskAxes[]=[{EI:"E",SN:"S",TF:"T",JP:"P"},{EI:"E",SN:"S",TF:"T",JP:"P"},{EI:"I",SN:"S",TF:"T",JP:"J"}];
  f.tasks=f.tasks.map((task,i)=>({...task,axes:picks[i]}));
  return toCardObservation(toReport(validateSubmission(f,now)),selfType);
}
const card=(data:Submission,selfType:TypeCode|null)=>toCardObservation(toReport(validateSubmission(data,now)),selfType);

test("the measured ESTP has faded E and P, a legend, and keeps the code readable",()=>{
  const c=cardComposition(estp(null),"chibi","codex");
  assert.equal(c.type,"ESTP");
  assert.deepEqual(c.leans,[true,false,false,true]);
  assert.equal(c.legend,"淡色＝傾向");
  assert.equal(c.tagline,"給做法 · 看證據");
  const svg=cardSvg(c);
  assert.ok(svg.includes('<tspan fill-opacity=".38" class="lean-letter">E</tspan>ST<tspan fill-opacity=".38" class="lean-letter">P</tspan>'));
  assert.ok(svg.includes(">淡色＝傾向</text>"));
});

test("a clear INTJ has no faded letters and no legend",()=>{
  const c=cardComposition(card(makeFixture(),null),"chibi","codex");
  assert.deepEqual(c.leans,[false,false,false,false]);
  assert.equal(c.legend,"");
  assert.ok(!cardSvg(c).includes("lean-letter"));
});

test("zh-TW card and share text contrast a different self-type, confirm a matching one, and stay plain without one",()=>{
  assert.equal(cardComposition(estp("INTJ"),"chibi","codex").tagline,"你以為你是 INTJ，帶 Agent 時是 ESTP");
  assert.equal(cardComposition(estp("ESTP"),"chibi","codex").tagline,"你帶 Agent 時也是 ESTP");
  assert.equal(cardComposition(estp(null),"chibi","codex").tagline,"給做法 · 看證據");
  assert.equal(shareText(estp("INTJ"),false),"你的 Agent MBTI\n阿星\n你以為你是 INTJ，帶 Agent 時是 ESTP\nLV ?\n你給的多是具體做法：檔案、步驟、指令、範例。\n你驗收時看證據：測試、數字、規格、差異。\nhttps://agent-mbti-cards.dnplus.chatgpt.site/");
  assert.equal(shareText(estp("ESTP"),false,"zh-TW",false),"你的 Agent MBTI\n阿星\n你帶 Agent 時也是 ESTP\nLV ?\nhttps://agent-mbti-cards.dnplus.chatgpt.site/");
  assert.equal(shareText(estp(null),false,"zh-TW",false),"你的 Agent MBTI\n阿星\nESTP\nLV ?\nhttps://agent-mbti-cards.dnplus.chatgpt.site/");
});

test("en card and share text follow the same three cases",()=>{
  assert.equal(cardComposition(estp("INTJ"),"chibi","codex",false,"en").tagline,"You thought you were INTJ. Leading your Agent, you're ESTP");
  assert.equal(cardComposition(estp("ESTP"),"chibi","codex",false,"en").legend,"Faded = leaning");
  assert.equal(shareText(estp("INTJ"),false,"en"),"Your Agent MBTI\n阿星\nYou thought you were INTJ. Leading your Agent, you're ESTP\nLV ?\nYou mostly hand over the how: files, steps, commands, examples.\nYou check results by evidence: tests, numbers, specs, diffs.\nhttps://agent-mbti-cards.dnplus.chatgpt.site/");
  assert.equal(shareText(estp("ESTP"),false,"en",false),"Your Agent MBTI\n阿星\nLeading your Agent, you're ESTP too\nLV ?\nhttps://agent-mbti-cards.dnplus.chatgpt.site/");
  assert.equal(shareText(estp(null),false,"en",false),"Your Agent MBTI\n阿星\nESTP\nLV ?\nhttps://agent-mbti-cards.dnplus.chatgpt.site/");
});

test("a partial result contrasts against its pattern, an empty one never contrasts, and nickname-only hides everything",()=>{
  assert.equal(cardComposition(card(makePartialFixture(),"INTJ"),"chibi","codex").tagline,"你以為你是 INTJ，帶 Agent 時是 IN?J");
  assert.equal(cardComposition(card(makePartialFixture(),null),"chibi","codex").type,"IN?J");
  const empty=makeFixture();
  empty.tasks=empty.tasks.map(task=>({...task,axes:{EI:"unclear",SN:"unclear",TF:"unclear",JP:"unclear"}}));
  const blank=cardComposition(card(empty,"INTJ"),"chibi","codex");
  assert.deepEqual([blank.type,blank.tagline,blank.legend,blank.leans],["未定型","輪廓還在形成","",[]]);
  assert.equal(shareText(estp("INTJ"),true),"你的 Agent MBTI\n阿星\nhttps://agent-mbti-cards.dnplus.chatgpt.site/");
  assert.equal(cardComposition(estp("INTJ"),"chibi","codex",true).tagline,"");
});
