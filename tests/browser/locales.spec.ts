import {test,expect,type Page} from "@playwright/test";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {locales,translator,localizedProtocol,bodyFonts,type Locale} from "../../lib/i18n.ts";
import copy from "../../lib/collector-copy.json" with {type:"json"};
import {makeFixture,makePartialFixture} from "../../lib/fixture.ts";

const base="http://127.0.0.1:5188";
const names:Record<Locale,string>={"zh-TW":"月光搭檔","zh-CN":"星河伙伴",ja:"ヒカリ",ko:"빛별",en:"Lumi"};
async function shot(page:Page,locale:Locale,name:string,fullPage=false){
  await page.evaluate(()=>document.fonts.ready);
  for(const img of await page.locator("img:visible").all())await img.evaluate((el:HTMLImageElement)=>el.decode());
  await page.screenshot({path:"evidence/locales/"+locale+"-"+name+".png",animations:"disabled",fullPage});
}
async function noOverflow(page:Page){const width=page.viewportSize()!.width;expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}

for(const locale of locales)test(locale+": browser default, complete report flow, real statuses, PNG, card-only, unknown and renewal",async({browser})=>{
  test.setTimeout(180000);
  const context=await browser.newContext({locale,viewport:{width:1536,height:1024},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage(),t=translator(locale),errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await context.addInitScript(()=>{
    const w=window as unknown as {cardDraws:Array<{text:string,font:string,fontStatus:string}>};w.cardDraws=[];
    const original=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text:string,x:number,y:number,maxWidth?:number){w.cardDraws.push({text,font:this.font,fontStatus:document.fonts.status});return maxWidth===undefined?original.call(this,text,x,y):original.call(this,text,x,y,maxWidth);};
  });
  await page.clock.install();
  await page.goto(base);await expect(page.locator(".app-root")).toHaveAttribute("data-ready","true");
  await expect(page.locator("html")).toHaveAttribute("lang",locale);
  await expect(page.getByRole("button",{name:t("開始觀察"),exact:true})).toBeVisible();
  const alternate=locale==="en"?"ja":"en";
  await page.locator(".locale-switch select").selectOption(alternate);await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang",alternate);
  expect(await page.evaluate(()=>localStorage.getItem("agent-mbti-locale-v1"))).toBe(alternate);
  await page.locator(".locale-switch select").selectOption(locale);await expect(page.locator("html")).toHaveAttribute("lang",locale);
  await shot(page,locale,"desktop-cover");await page.setViewportSize({width:390,height:844});await shot(page,locale,"mobile-cover");await noOverflow(page);

  async function create(email:boolean,nickname=names[locale]){
    await page.getByRole("button",{name:t("開始觀察"),exact:true}).click();
    await page.getByRole("button",{name:t("建立我的連結"),exact:true}).click();
    expect(await page.locator("#nickname").evaluate((e:HTMLInputElement)=>e.validationMessage)).toBe(t("請填寫 Agent 的名字。"));
    await page.locator("#nickname").fill(nickname);
    if(email){
      await page.locator(".email-disclosure summary").click();await page.locator("#email").fill("locale-fixture@example.test");
      await expect(page.getByRole("button",{name:t("建立我的連結"),exact:true})).toBeDisabled();
      await page.getByRole("checkbox",{name:t("我同意 Email 僅用於這次報告寄送，不用於行銷。"),exact:true}).check();
    }
    const event=page.waitForResponse(r=>r.url()===base+"/api/sessions"&&r.request().method()==="POST");
    await page.getByRole("button",{name:t("建立我的連結"),exact:true}).click();
    const response=await event;expect(response.status()).toBe(201);const session=await response.json();
    await expect(page.locator(".app-root")).toHaveAttribute("data-stage","instructions");return session;
  }
  async function remove(){
    await page.getByRole("button",{name:t("關於這份觀察"),exact:true}).click();
    await page.getByRole("button",{name:t("結束觀察並刪除資料"),exact:true}).click();
    await expect(page.locator(".app-root")).toHaveAttribute("data-stage","cover");
  }
  async function submit(s:{id:string;writeToken:string;nickname:string},partial=false){
    const response=await context.request.post(base+"/api/collect/"+s.id,{headers:{Authorization:"Bearer "+s.writeToken,"Idempotency-Key":"locale-"+locale+"-"+s.id},data:partial?makePartialFixture(s.nickname):makeFixture(s.nickname)});
    expect(response.status()).toBe(201);await page.clock.runFor(3000);await expect(page.locator(".app-root")).toHaveAttribute("data-stage","reveal");
  }
  const s=await create(true);await noOverflow(page);await shot(page,locale,"mobile-instructions");
  await page.locator(".instruction-disclosure summary").click();
  const prompt=await page.locator(".instruction-box").inputValue();
  expect(prompt).toContain(copy[locale].intro);expect(prompt).toContain(base+localizedProtocol(locale));expect(prompt).toContain(s.id);expect(prompt).not.toContain(s.readToken);expect(prompt).not.toContain("locale-fixture@example.test");
  await writeFile("evidence/locales/"+locale+"-collector-sanitized.txt",prompt.replaceAll(s.writeToken,"[REDACTED_WRITE_TOKEN]").replaceAll(s.id,"[SYNTHETIC_SESSION]"));
  const protocol=await context.request.get(base+localizedProtocol(locale));expect(protocol.status()).toBe(200);
  await page.getByRole("button",{name:t("我已複製，開始等待"),exact:true}).click();
  await expect(page.locator(".waiting-status")).toContainText(t("還沒與 Agent 連上"));
  const status=await context.request.post(base+"/api/collect/"+s.id+"/status",{headers:{Authorization:"Bearer "+s.writeToken},data:{sequence:1,phase:"awaiting_host_approval",approvalKind:"network"}});
  expect(status.status()).toBe(200);await page.clock.runFor(3000);
  await expect(page.locator(".waiting-status")).toContainText(t("Agent 回報需要主機核准"));await expect(page.locator(".waiting-explanation")).toContainText(t("連線"));await shot(page,locale,"host-approval");
  await page.clock.fastForward(91000);await expect(page.locator(".waiting-status")).toContainText(t("暫時沒有新的進度"));await noOverflow(page);
  await page.clock.setSystemTime(new Date());await submit(s);
  await expect(page.locator(".card-code")).toHaveText("INTJ");
  await page.getByRole("button",{name:t("看看我的觀察"),exact:true}).click();
  await expect(page.locator(".result-signature span")).toHaveText(t("路線策畫家"));
  await page.locator(".report-details>summary").click();await page.locator(".evidence-details>summary").click();
  await expect(page.locator(".metrics-list")).toContainText(t("最常用模型家族"));await expect(page.locator(".report-content")).toContainText(t("沒有 Tokscale 彙總"));
  await expect(page.locator(".task-evidence")).toHaveCount(3);await noOverflow(page);await shot(page,locale,"mobile-report",true);
  await page.getByRole("button",{name:t("收藏我的卡片"),exact:true}).click();
  await expect(page.locator(".card-code")).toHaveCount(0);
  await page.locator(".card-options>summary").click();await page.getByRole("checkbox",{name:t("只顯示暱稱，隱藏分型"),exact:true}).uncheck();await page.locator(".card-options>summary").click();
  await noOverflow(page);await shot(page,locale,"mobile-collection");
  for(const style of ["chibi","regular"]){
    await page.getByRole("button",{name:t(style==="chibi"?"Q 版":"一般"),exact:true}).click();
    const event=page.waitForEvent("download");await page.getByRole("button",{name:t("下載我的角色卡"),exact:true}).click();
    const download=await event;expect(download.suggestedFilename()).toContain(locale+"-"+t("角色卡"));
    const path="evidence/locales/"+locale+"-card-"+style+".png";await download.saveAs(path);
    const png=await readFile(path);expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([1080,1620]);
  }
  const draws=await page.evaluate(()=>(window as unknown as {cardDraws:Array<{text:string;font:string;fontStatus:string}>}).cardDraws);
  expect(draws.some(d=>d.text===t("路線策畫家"))).toBe(true);
  expect(draws.some(d=>d.text===t("合作風格觀察 · 非官方 MBTI 評量 · 造型與分型無關"))).toBe(true);
  expect(draws.every(d=>d.fontStatus==="loaded")).toBe(true);
  expect(draws.some(d=>d.font.includes(bodyFonts[locale].split(",")[0].replaceAll('"',"")))).toBe(true);
  expect(draws.some(d=>d.text.includes("locale-fixture@example.test")||d.text.includes(s.id)||d.text.includes(s.readToken))).toBe(false);
  await writeFile("evidence/locales/"+locale+"-canvas-text.json",JSON.stringify(draws,null,2));
  await remove();
  const cardOnly=await create(false);await submit(cardOnly);
  await expect(page.getByRole("button",{name:t("看看我的觀察"),exact:true})).toHaveCount(0);
  const only=await(await context.request.get(base+"/api/sessions/"+cardOnly.id,{headers:{Authorization:"Bearer "+cardOnly.readToken}})).json();
  expect(only.report).toBeNull();expect(only.reportAccess).toBe("card_only");
  await page.getByRole("button",{name:t("收藏我的卡片"),exact:true}).click();
  const privateDownload=page.waitForEvent("download");await page.getByRole("button",{name:t("下載我的角色卡"),exact:true}).click();await(await privateDownload).saveAs("evidence/locales/"+locale+"-nickname-only.png");
  await remove();

  const unknown=await create(true);await submit(unknown,true);await expect(page.locator(".card-code")).toHaveText(t("未定型"));
  await page.getByRole("button",{name:t("看看我的觀察"),exact:true}).click();await page.locator(".report-details>summary").click();
  await expect(page.locator(".report-content")).toContainText(t("證據還不夠"));await shot(page,locale,"unknown",true);await remove();

  await page.getByRole("button",{name:t("開始觀察"),exact:true}).click();await page.locator("#nickname").fill("invalid@name");
  await page.getByRole("button",{name:t("建立我的連結"),exact:true}).click();await expect(page.locator(".inline-notice")).toHaveText(t("請檢查暱稱、Email 與結果用途同意。"));
  await page.locator("#nickname").fill(names[locale]);await page.getByRole("button",{name:t("建立我的連結"),exact:true}).click();await expect(page.locator(".app-root")).toHaveAttribute("data-stage","instructions");
  await page.locator(".instruction-disclosure summary").click();await page.getByRole("button",{name:t("我已複製，開始等待"),exact:true}).click();
  await page.clock.fastForward(31*60*1000);await expect(page.getByRole("button",{name:t("沿用分析，換新連結"),exact:true})).toBeVisible();await shot(page,locale,"expired");await noOverflow(page);
  await page.getByRole("button",{name:t("沿用分析，換新連結"),exact:true}).click();await expect(page.locator(".renewal-note")).toHaveText(t("將建立新的收件連結。舊連結不延長；新指令會要求你明確核准新目的地，已保存的最小摘要可繼續使用。"));
  await page.clock.setSystemTime(new Date());await page.getByRole("button",{name:t("建立我的連結"),exact:true}).click();await expect(page.locator(".app-root")).toHaveAttribute("data-stage","instructions");
  expect(await page.locator(".instruction-box").inputValue()).toContain(copy[locale].renew);await remove();
  await page.goto(base+"/art-gallery");await expect(page.locator("html")).toHaveAttribute("lang",locale);
  await expect(page.locator(".art-grid article")).toHaveCount(16);
  await page.getByRole("button",{name:t("放大檢視 ")+"INTJ",exact:true}).click();await expect(page.locator(".art-inspector>p").first()).toContainText(t("用双手展示一張大幅矩形構造圖，指向其中一個區塊。"));
  await shot(page,locale,"gallery-inspector");await noOverflow(page);
  expect(errors).toEqual([]);await context.close();
});
