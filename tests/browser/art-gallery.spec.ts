const evidenceDir=process.env.BROWSER_EVIDENCE_DIR??"evidence/final-card";
import {test,expect} from "@playwright/test";
import {artSlots,artFamilies,artStyles,artCounts} from "../../lib/art-catalog.ts";
import {typeCodes,type TypeCode} from "../../lib/contract.ts";
import {makeFixture} from "../../lib/fixture.ts";
import {asNewClient} from "./support.ts";

test("192-slot gallery loads exact art or honest pending states, inspector and mobile framing",async({page} )=>{
  test.setTimeout(120000);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/art-gallery");
  await expect(page.locator(".gallery-header")).toContainText(artCounts.ready+" / 192 張");
  const sources=new Set<string>();
  for(const family of artFamilies){
    await page.getByRole("combobox",{name:"角色家族",exact:true}).selectOption(family);
    for(const style of artStyles){
      await page.getByRole("button",{name:style==="regular" ? "一般" : "Q 版",exact:true}).first().click();
      await expect(page.locator(".art-grid article")).toHaveCount(16);
      for(const slot of artSlots.filter(s=>s.family===family&&s.style===style)){
        const card=page.locator('[data-slot="'+family+":"+slot.type+":"+style+'"]');
        await expect(card.locator(".card-code")).toHaveText(slot.type);
        if(slot.status==="ready"){
          const img=card.locator(".card-front image");await expect(img).toHaveAttribute("href",slot.src!);
          expect(await img.evaluate(async(img:SVGImageElement)=>{const r=await fetch(img.href.baseVal);const bitmap=await createImageBitmap(await r.blob());return bitmap.width>=512&&bitmap.height>=512;})).toBe(true);
          await expect(img).toHaveAttribute("preserveAspectRatio","xMidYMid meet");
          expect(sources.has(slot.src!)).toBe(false);sources.add(slot.src!);
        }else{await expect(card.locator(".card-front image")).toHaveCount(0);await expect(card.locator(".missing-art")).toContainText("專屬插畫製作中");}
      }
      await page.screenshot({fullPage:true,animations:"disabled",path:evidenceDir+"/gallery-"+family+"-"+style+".png"});
    }
  }
  expect(sources.size).toBe(artCounts.ready);
  await page.getByRole("button",{name:"放大檢視 INTP",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button",{name:"一般",exact:true}).click();
  await expect(page.getByRole("dialog").locator(".card-front image")).toHaveAttribute("href","/art/mbti/glm/intp-regular.webp");
  await page.screenshot({animations:"disabled",path:evidenceDir+"/gallery-inspector.png"});
  await page.getByRole("button",{name:"關閉插畫",exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.getByRole("combobox",{name:"角色家族",exact:true}).selectOption("codex");await page.getByRole("button",{name:"Q 版",exact:true}).first().click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({animations:"disabled",path:evidenceDir+"/gallery-mobile.png"});
  expect(errors).toEqual([]);
});

function fixtureFor(type:TypeCode,nickname:string){
  const f=makeFixture(nickname);
  f.tasks=f.tasks.map(t=>({...t,axes:{EI:type[0] as "E"|"I",SN:type[1] as "S"|"N",TF:type[2] as "T"|"F",JP:type[3] as "J"|"P"}}));
  return f;
}
test("every type reaches its own art through real callback; theme and style never change assessment",async({page,request})=>{
  test.setTimeout(180000);
  const used=new Set<string>();
  for(const type of typeCodes){
    await page.goto("/");await expect(page.locator(".app-root")).toHaveAttribute("data-ready","true");
    await page.getByRole("button",{name:"開始觀察",exact:true}).click();await page.getByLabel("Agent 的名字").fill("圖庫驗收 "+type);await asNewClient(page);
    const pending=page.waitForResponse(r=>r.url().endsWith("/api/sessions")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"建立我的連結",exact:true}).click();const session=await(await pending).json();
    try{
      const submitted=await request.post("/api/collect/"+session.id,{headers:{Authorization:"Bearer "+session.writeToken,"Idempotency-Key":"art-matrix-"+type+"-fixture"},data:fixtureFor(type,session.nickname)});expect(submitted.status()).toBe(201);
      await expect(page.locator(".app-root")).toHaveAttribute("data-stage","reveal");await expect(page.locator(".card-code")).toHaveText(type);
      await page.locator(".card-options>summary").click();await page.getByRole("checkbox",{name:"只顯示暱稱，隱藏分型",exact:true}).uncheck();
      for(const family of artFamilies){
        await page.getByLabel("卡面主題").selectOption(family);
        for(const style of artStyles){
          await page.getByRole("button",{name:style==="regular" ? "一般" : "Q 版",exact:true}).click();
          const slot=artSlots.find(s=>s.family===family&&s.type===type&&s.style===style)!;
          await expect(page.locator(".card-code")).toHaveText(type);
          if(slot.status==="ready"){await expect(page.locator(".card-front image")).toHaveAttribute("href",slot.src!);used.add(slot.src!);await expect(page.getByRole("button",{name:"下載我的角色卡",exact:true})).toBeEnabled();}
          else{await expect(page.locator(".card-front image")).toHaveCount(0);await expect(page.getByRole("button",{name:"下載我的角色卡",exact:true})).toBeDisabled();}
        }
      }
      if(type==="INTP"||type==="ENFJ"||type==="ESFP"){
        await page.getByLabel("卡面主題").selectOption("codex");await page.getByRole("button",{name:"一般",exact:true}).click();await page.locator(".card-options>summary").click();
        await page.screenshot({animations:"disabled",path:evidenceDir+"/result-"+type+".png"});
        for(const style of artStyles){await page.getByRole("button",{name:style==="regular" ? "一般" : "Q 版",exact:true}).click();const file=page.waitForEvent("download");await page.getByRole("button",{name:"下載我的角色卡",exact:true}).click();await(await file).saveAs(evidenceDir+"/card-"+type+"-"+style+".png");}
      }
      const state=await(await request.get("/api/sessions/"+session.id,{headers:{Authorization:"Bearer "+session.readToken}})).json();expect(state.card.assessment.type).toBe(type);
      await page.getByRole("button",{name:"關於這份觀察",exact:true}).click();await page.getByRole("button",{name:"結束觀察並刪除資料",exact:true}).click();await expect(page.locator(".app-root")).toHaveAttribute("data-stage","cover");
    }finally{await request.delete("/api/sessions/"+session.id,{headers:{Authorization:"Bearer "+session.readToken,Origin:"http://127.0.0.1:5188"}});}
  }
  expect(used.size).toBe(artCounts.ready);
});
