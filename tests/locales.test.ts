import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import messages from "../lib/messages.json" with {type:"json"};
import copy from "../lib/collector-copy.json" with {type:"json"};
import {locales,resolveLocale,translate,noticeText,localizedProtocol,bodyFonts} from "../lib/i18n.ts";
import {collectorInstructions} from "../lib/collector-instructions.ts";
import {describeProgress} from "../lib/collector-progress.ts";
import {artSlots} from "../lib/art-catalog.ts";

test("browser language priority, region/script variants and explicit fallback",()=>{
  for(const [input,expected] of [[["zh-Hant-HK"],"zh-TW"],[["zh-CN"],"zh-CN"],[["zh-Hans"],"zh-CN"],[["zh-SG"],"zh-CN"],[["zh"],"zh-TW"],[["ja-JP"],"ja"],[["ko-KR"],"ko"],[["fr-FR","en-GB"],"en"],[["ko","ja"],"ko"],[[],"en"]] as const)assert.equal(resolveLocale(input),expected);
});
test("all authored UI, report, art and error strings have four complete translations with matching parameters",()=>{
  const dictionary=messages as Record<string,string[]>;
  const params=(text:string)=>[...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m=>m[1]).sort();
  for(const [key,values] of Object.entries(dictionary)){
    assert.equal(values.length,4,key);
    for(const text of values){assert.ok(text.trim(),key);assert.deepEqual(params(text),params(key),key);}
  }
  for(const file of ["components/persona-app.tsx","components/holo-card.tsx","components/art-gallery.tsx","components/locale-provider.tsx","lib/catalog.ts","lib/workstyle.ts","lib/collector-progress.ts","lib/session-service.ts","lib/assessment.ts","lib/export-card.ts"]){
    const sf=ts.createSourceFile(file,fs.readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const visit=(node:ts.Node)=>{
      if((ts.isStringLiteral(node)||ts.isJsxText(node))&&/[\u3400-\u9fff]/.test(node.text)){
        const source=node.text.replace(/\s+/g," ").trim();
        if(!["、上善無形","。","，"].includes(source))assert.ok(dictionary[source],file+": "+source);
      }
      ts.forEachChild(node,visit);
    };visit(sf);
  }
  for(const slot of artSlots){assert.ok(dictionary[slot.theme]);assert.ok(dictionary[slot.description]);}
});
test("parameters retain names and codes literally without recursive translation, and unexpected errors stay private",()=>{
  assert.equal(translate("en","這次偏向 {type}。",{type:"INTJ"}),"This time, leaning toward INTJ.");
  const name="月 {type} 빛";assert.ok(translate("en","{name}卡片，{style}，使用方向鍵或拖曳旋轉",{name,style:"Chibi"}).includes(name));
  for(const locale of locales){assert.ok(!noticeText(locale,"secret-path /private/actual-user-data").includes("private"));assert.notEqual(noticeText(locale,"請檢查暱稱、Email 與結果用途同意。"),"");}
});
test("every localized collector preserves write-only destination, protocol, one-grant flow and explicit renewal",()=>{
  const session={id:"public-test-id",nickname:"Lumi 月 빛",readToken:"NEVER_REVEAL_READ_CAPABILITY",writeToken:"WRITE_ONLY_TEST_TOKEN",expiresAt:Date.parse("2026-10-10T12:30:00Z")};
  for(const locale of locales){
    const prompt=collectorInstructions(session,"http://127.0.0.1:5188",false,locale);
    const renewal=collectorInstructions(session,"http://127.0.0.1:5188",true,locale);
    for(const part of ["version 2.0","agent-workstyle-v1","ownerRequest","both_available","type:null","24 KiB","Idempotency-Key","awaiting_host_approval","Authorization: Bearer WRITE_ONLY_TEST_TOKEN","0600","503","409","404","410","Email","Tokscale",JSON.stringify(session.nickname),localizedProtocol(locale)])assert.ok(prompt.includes(part),locale+": "+part);
    assert.ok(prompt.includes(copy[locale].intro));
    assert.ok(renewal.includes(copy[locale].renew));
    assert.ok(!prompt.includes("NEVER_REVEAL_READ_CAPABILITY"));
    assert.ok(!prompt.includes("{origin}")&&!prompt.includes("{nickname}"));
    assert.notEqual(prompt,renewal);
    assert.ok(bodyFonts[locale].includes("sans-serif"));
    if(locale!=="zh-TW"){const protocol=fs.readFileSync("public"+localizedProtocol(locale),"utf8");for(const p of ["T001","O001","W >= 3","W × 3 >= N × 2","abs(left - right) >= 2","coverage.scope:insufficient","type:null","duplicate:true","Email","Myers & Briggs Foundation"])assert.ok(protocol.includes(p),locale+": "+p);}
  }
});
test("real approval and stale progress are localized independently of the observed state",()=>{
  const progress={phase:"awaiting_host_approval" as const,sequence:1,updatedAt:1000,approvalKind:"network" as const};
  for(const locale of locales){
    const active=describeProgress(progress,1001,locale),stale=describeProgress(progress,91001,locale);
    assert.equal(active.title,translate(locale,"Agent 回報需要主機核准"));
    assert.ok(active.details.includes(translate(locale,"連線")));
    assert.equal(stale.title,translate(locale,"暫時沒有新的進度"));
    assert.equal(stale.stale,true);
  }
});
