import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {makeFixture,makePartialFixture} from '../../lib/fixture.ts';

const shot=async(page:Page,name:string)=>{for(const image of await page.locator('img:visible').all())await image.evaluate((img:HTMLImageElement)=>img.decode());await page.screenshot({animations:'disabled',path:`evidence/art-192/${name}.png`});};
const ready=async(page:Page)=>{await page.goto('/');await expect(page.locator('.app-root')).toHaveAttribute('data-ready','true');};
async function create(page:Page,nickname='測試星河',email=false){
  await page.getByRole('button',{name:'開始觀察',exact:true}).click();
  await page.getByLabel('Agent 的名字',{exact:true}).fill(nickname);
  if(email){await page.locator('.email-disclosure summary').click();await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await expect(page.getByRole('button',{name:'建立我的連結',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:/我同意 Email/}).check();}
  const response=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'建立我的連結',exact:true}).click();
  const session=await(await response).json();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','instructions');return session;
}
async function waiting(page:Page){await page.locator('.instruction-disclosure summary').click();await page.getByRole('button',{name:'我已複製，開始等待',exact:true}).click();await expect(page.locator('.waiting-status')).toContainText('還沒與 Agent 連上');}
async function remove(page:Page){await page.getByRole('button',{name:'關於這份觀察',exact:true}).click();await page.getByRole('button',{name:'結束觀察並刪除資料',exact:true}).click();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','cover');}

test('single-focus desktop: email report, back preservation, real callback, collection and private PNG',async({page,request,context})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
  await expect(page.getByRole('heading',{level:1})).toHaveText('你的 Agent，是哪一種 MBTI？');
  await expect(page.getByRole('button')).toHaveCount(2);await expect(page.locator('.card-code')).toHaveCount(0);await expect(page.locator('.card-level')).toHaveCount(0);
  await shot(page,'desktop-cover');
  await page.getByRole('button',{name:'開始觀察',exact:true}).click();await page.getByLabel('Agent 的名字',{exact:true}).fill('測試星河');
  await shot(page,'desktop-identity');await page.getByRole('button',{name:'返回上一步',exact:true}).click();await page.getByRole('button',{name:'開始觀察',exact:true}).click();await expect(page.getByLabel('Agent 的名字')).toHaveValue('測試星河');
  await page.locator('.email-disclosure summary').click();await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await expect(page.getByRole('button',{name:'建立我的連結',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:/我同意 Email/}).check();await shot(page,'desktop-email');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'建立我的連結',exact:true}).click();const s=await(await response).json();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','instructions');
  await shot(page,'desktop-instructions');
  const instructions=await page.getByLabel('貼給 Agent 的指令').inputValue();expect(instructions).toContain(s.id);expect(instructions).not.toContain(s.readToken);expect(instructions).not.toContain('fixture@example.test');expect(instructions).toContain('ownerRequest');expect(instructions).not.toMatch(/Raymond|PVSE|LV4/);
  await context.grantPermissions(['clipboard-read','clipboard-write']);await page.getByRole('button',{name:'複製專屬指令',exact:true}).click();await expect(page.locator('.waiting-status')).toContainText('還沒與 Agent 連上');await shot(page,'desktop-waiting');
  await page.getByRole('button',{name:'重看指令',exact:true}).click();await page.getByRole('button',{name:'返回上一步',exact:true}).click();await expect(page.getByLabel('Agent 的名字')).toHaveValue('測試星河');await expect(page.getByLabel('Agent 的名字')).toHaveAttribute('readonly','');await page.getByRole('button',{name:'繼續這個連結',exact:true}).click();await page.getByRole('button',{name:'複製專屬指令',exact:true}).click();
  const headers={Authorization:`Bearer ${s.writeToken}`,'Idempotency-Key':'guided-desktop-callback'};
  expect((await request.post(`/api/collect/${s.id}`,{headers,data:makeFixture(s.nickname)})).status()).toBe(201);
  expect((await request.post(`/api/collect/${s.id}`,{headers,data:makeFixture(s.nickname)})).status()).toBe(200);
  expect((await request.post(`/api/collect/${s.id}`,{headers:{...headers,'Idempotency-Key':'other-guided-callback'},data:makeFixture(s.nickname)})).status()).toBe(409);
  await expect(page.locator('.app-root')).toHaveAttribute('data-stage','reveal');await expect(page.locator('.card-code')).toHaveText('INTJ');await shot(page,'desktop-reveal');
  await page.getByRole('button',{name:'看看我的觀察',exact:true}).click();await expect(page.locator('.axis-line>div')).toHaveCount(4);await expect(page.locator('.delivery-state')).toContainText('寄送尚未開放');await shot(page,'desktop-summary');
  await page.locator('.report-details>summary').click();await expect(page.locator('.metrics-list')).toContainText('OpenAI / GPT');await page.locator('.evidence-details>summary').click();await expect(page.locator('.task-evidence')).toHaveCount(3);await expect(page.locator('.task-evidence')).toContainText(['主人：','主人：','主人：']);await shot(page,'desktop-report-expanded');
  await page.getByRole('button',{name:'收藏我的卡片',exact:true}).click();await expect(page.locator('.card-code')).toHaveCount(0);await expect(page.locator('.card-level')).toHaveCount(0);await shot(page,'desktop-collection-chibi');
  const down=page.waitForEvent('download');await page.getByRole('button',{name:'下載我的角色卡',exact:true}).click();await(await down).saveAs('evidence/art-192/card-nickname.png');
  const png=await readFile('evidence/art-192/card-nickname.png');expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([1080,1620]);
  await page.locator('.card-options summary').click();await page.getByRole('checkbox',{name:'只顯示暱稱，隱藏分型',exact:true}).uncheck();await page.getByRole('button',{name:'一般',exact:true}).click();await expect(page.locator('.card-art img')).toHaveAttribute('src','/art/mbti/codex/intj-regular.png');
  const before=await page.getByTestId('holo-card').getAttribute('style');await page.getByTestId('holo-card').press('ArrowRight');await expect.poll(()=>page.getByTestId('holo-card').getAttribute('style')).not.toBe(before);
  const full=page.waitForEvent('download');await page.getByRole('button',{name:'下載我的角色卡',exact:true}).click();await(await full).saveAs('evidence/art-192/card-regular.png');await page.locator('.card-options summary').click();await shot(page,'desktop-collection-regular');
  await page.reload();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','collection');await expect(page.getByRole('button',{name:'一般',exact:true})).toHaveAttribute('aria-pressed','true');const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('agent-mbti-session-v2')!));expect(saved).not.toHaveProperty('writeToken');expect(page.url()).toBe('http://127.0.0.1:5188/');expect(await page.locator('body').innerText()).not.toMatch(/Raymond|PVSE|LV[0-5]|AI 人物誌/);
  await remove(page);expect((await request.get(`/api/sessions/${s.id}`,{headers:{Authorization:`Bearer ${s.readToken}`}})).status()).toBe(404);
  await page.getByRole('button',{name:'關於這份觀察',exact:true}).click();await page.getByRole('button',{name:'使用虛構資料體驗',exact:true}).click();await page.getByRole('button',{name:'建立我的連結',exact:true}).click();await page.getByRole('button',{name:'查看示範範圍',exact:true}).click();await expect(page.locator('.fixture-json')).toHaveCount(0);await expect(page.locator('.scope-card')).toContainText('2026/10/01–10/09');await expect(page.getByRole('button',{name:'同意並開始示範',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:'我同意此範圍的虛構摘要自動驗證並傳送。',exact:true}).check();await shot(page,'single-scope-consent');await page.getByRole('button',{name:'同意並開始示範',exact:true}).click();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','reveal');await page.getByRole('button',{name:'收藏我的卡片',exact:true}).click();await expect(page.locator('.card-code')).toHaveCount(0);await remove(page);expect(errors).toEqual([]);
});

test('no email is card-only across server, reveal, collection and restored tab',async({page,request})=>{
  await ready(page);const s=await create(page,'只要卡片');await waiting(page);
  expect((await request.post(`/api/collect/${s.id}`,{headers:{Authorization:`Bearer ${s.writeToken}`,'Idempotency-Key':'card-only-callback'},data:makeFixture(s.nickname)})).status()).toBe(201);
  await expect(page.locator('.app-root')).toHaveAttribute('data-stage','reveal');await expect(page.getByRole('button',{name:'看看我的觀察',exact:true})).toHaveCount(0);
  const read=await(await request.get(`/api/sessions/${s.id}`,{headers:{Authorization:`Bearer ${s.readToken}`}})).json();expect(read.report).toBeNull();expect(read.reportAccess).toBe('card_only');expect(JSON.stringify(read)).not.toMatch(/humanSessions|observedPeriod|observations|tasks|inputTokens/);
  await page.getByRole('button',{name:'收藏我的卡片',exact:true}).click();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','collection');await page.reload();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','collection');await expect(page.locator('.report-details')).toHaveCount(0);await remove(page);
});

test('mobile 390×844: one screen, touch drag, style controls, no overflow',async({browser,request})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const page=await context.newPage();await ready(page);await shot(page,'mobile-cover');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const s=await create(page,'手機旅人');await waiting(page);await shot(page,'mobile-waiting');
  expect((await request.post(`/api/collect/${s.id}`,{headers:{Authorization:`Bearer ${s.writeToken}`,'Idempotency-Key':'mobile-guided-callback'},data:makeFixture(s.nickname)})).status()).toBe(201);await expect(page.locator('.app-root')).toHaveAttribute('data-stage','reveal');await shot(page,'mobile-reveal');await page.getByRole('button',{name:'收藏我的卡片',exact:true}).click();
  const card=page.getByTestId('holo-card');const box=(await card.boundingBox())!;const devtools=await context.newCDPSession(page);const before=await card.getAttribute('style');await devtools.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.4,y:box.y+box.height*.6}]});await devtools.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.8,y:box.y+box.height*.3}]});await devtools.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>card.getAttribute('style')).not.toBe(before);
  await page.getByRole('button',{name:'一般',exact:true}).click();await expect(page.locator('.card-art img')).toHaveAttribute('src','/art/mbti/codex/intj-regular.png');await page.getByRole('button',{name:'Q 版',exact:true}).click();await shot(page,'mobile-collection');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await remove(page);await context.close();
});

test('connection retry, pending restore without write authority, cancellation and expiry recovery',async({page})=>{
  await page.clock.install();await ready(page);const s=await create(page,'返回旅人');await waiting(page);
  await page.route(`**/api/sessions/${s.id}`,route=>route.request().method()==='GET' ? route.abort('failed') : route.continue());await page.clock.runFor(3500);await expect(page.locator('.waiting-status')).toContainText('網站暫時連不上收件服務');await page.unroute(`**/api/sessions/${s.id}`);await page.getByRole('button',{name:'立即重試',exact:true}).click();await expect(page.locator('.waiting-status')).toContainText('還沒與 Agent 連上');
  await page.reload();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','waiting');await page.getByRole('button',{name:'重看指令',exact:true}).click();await expect(page.getByRole('button',{name:'複製專屬指令',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'繼續等待',exact:true})).toBeVisible();await page.getByRole('button',{name:'繼續等待',exact:true}).click();
  await page.clock.fastForward(31*60*1000);await expect(page.getByRole('button',{name:'沿用分析，換新連結',exact:true})).toBeVisible();await shot(page,'expired');await page.getByRole('button',{name:'沿用分析，換新連結',exact:true}).click();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','identity');await expect(page.getByLabel('Agent 的名字')).toHaveValue('返回旅人');await expect(page.locator('.renewal-note')).toContainText('舊連結不延長');await page.clock.setFixedTime(new Date());
  await page.getByRole('button',{name:'建立我的連結',exact:true}).click();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','instructions');expect(await page.getByLabel('貼給 Agent 的指令').inputValue()).toContain('明確同意新目的地');await remove(page);
});

test('reduced motion remains keyboard operable; unknown evidence stays unknown',async({page,request})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await ready(page);const card=page.getByTestId('holo-card');const transform=await card.evaluate(el=>getComputedStyle(el).transform);await card.press('ArrowRight');expect(await card.evaluate(el=>getComputedStyle(el).transform)).toBe(transform);
  const s=await create(page,'未知旅人',true);const f=makePartialFixture(s.nickname);f.metrics.modelUsage=[];f.metrics.modelUsageUnit='unknown';f.metrics.mostUsedModelFamily='unknown';expect((await request.post(`/api/collect/${s.id}`,{headers:{Authorization:`Bearer ${s.writeToken}`,'Idempotency-Key':'unknown-guided-callback'},data:f})).status()).toBe(201);
  await expect(page.locator('.card-code')).toHaveText('未定型');await expect(page.locator('.missing-art')).toBeVisible();await page.getByRole('button',{name:'看看我的觀察',exact:true}).press('Enter');await expect(page.locator('.result-signature strong')).toHaveText('未定型');await expect(page.locator('.axis-line')).toContainText('?');await page.locator('.report-details>summary').click();await expect(page.locator('.report-content')).toContainText('證據還不夠');await shot(page,'partial-report');await page.getByRole('button',{name:'收藏我的卡片',exact:true}).press('Enter');await expect(page.locator('.reduced-hint')).toBeVisible();await shot(page,'reduced-unknown');const d=page.waitForEvent('download');await page.getByRole('button',{name:'下載我的角色卡',exact:true}).press('Enter');expect((await d).suggestedFilename()).toContain('nickname');await page.locator('.card-options>summary').click();await page.getByRole('checkbox',{name:'只顯示暱稱，隱藏分型',exact:true}).uncheck();const partial=page.waitForEvent('download');await page.getByRole('button',{name:'下載我的角色卡',exact:true}).click();await(await partial).saveAs('evidence/art-192/card-untyped.png');await remove(page);
});

test('six themes and two styles retain one assessment and select this type-specific artwork',async({page,request})=>{
  await ready(page);const s=await create(page,'十二種卡面',true);await request.post(`/api/collect/${s.id}`,{headers:{Authorization:`Bearer ${s.writeToken}`,'Idempotency-Key':'twelve-guided-callback'},data:makeFixture(s.nickname)});await expect(page.locator('.app-root')).toHaveAttribute('data-stage','reveal');await page.getByRole('button',{name:'看看我的觀察',exact:true}).click();await page.getByRole('button',{name:'收藏我的卡片',exact:true}).click();await page.locator('.card-options summary').click();await page.getByRole('checkbox',{name:'只顯示暱稱，隱藏分型',exact:true}).uncheck();
  for(const family of ['codex','claude','gemini','grok','deepseek','glm']){await page.getByLabel('卡面主題',{exact:true}).selectOption(family);for(const style of ['regular','chibi']){await page.getByRole('button',{name:style==='regular'?'一般':'Q 版',exact:true}).click();const image=page.locator('.card-art img');await expect(image).toHaveAttribute('src',"/art/mbti/"+family+"/intj-"+style+".png");expect(await image.evaluate(async(img:HTMLImageElement)=>{await img.decode();return [img.naturalWidth,img.naturalHeight];})).toEqual([1024,1536]);await expect(page.locator('.card-code')).toHaveText('INTJ');if(style==='regular')await shot(page,`family-${family}`);}}
  await page.getByRole('button',{name:'返回上一步',exact:true}).click();await page.locator('.report-details>summary').click();await expect(page.locator('.metrics-list')).toContainText('OpenAI / GPT');await page.getByRole('button',{name:'關於這份觀察',exact:true}).click();await page.getByText('角色來源與非商業授權',{exact:true}).click();await expect(page.locator('.about-dialog')).toContainText('與分型計算獨立');await page.getByRole('button',{name:'結束觀察並刪除資料',exact:true}).click();
});

test('old browser result is ignored and every catalog entry uses a standard code',async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('ai-persona-session-v1',JSON.stringify({id:'00000000-0000-4000-8000-000000000009',readToken:'a'.repeat(64),expiresAt:Date.now()+100000,nickname:'舊結果'})));
  await ready(page);await expect(page.locator('.app-root')).toHaveAttribute('data-stage','cover');await expect(page.getByRole('button',{name:'開始觀察',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'關於這份觀察',exact:true}).click();await page.getByText('觀察依據與 16 種風格',{exact:false}).click();await expect(page.locator('.about-types>div')).toHaveCount(16);
  for(const code of await page.locator('.about-types b').allTextContents())expect(code).toMatch(/^[EI][SN][TF][JP]$/);
  await expect(page.locator('.about-dialog')).toContainText('舊結果需要重新分析');expect(await page.locator('.about-dialog').innerText()).not.toMatch(/Raymond|PVSE|LV[0-5]/);
});

test('observable progress, actual host approval, stale uncertainty and automatic website reveal',async({page,request})=>{
  await page.clock.install();await ready(page);const s=await create(page,'等待線索',true);await waiting(page);
  const signal=async(sequence:number,phase:string,approvalKind:string|null)=>request.post('/api/collect/'+s.id+'/status',{headers:{Authorization:'Bearer '+s.writeToken},data:{sequence,phase,approvalKind}});
  expect((await signal(1,'analyzing',null)).status()).toBe(200);
  await page.clock.runFor(3000);await expect(page.locator('.waiting-status')).toContainText('Agent 正在整理授權範圍');await shot(page,'agent-analyzing');
  expect((await signal(2,'awaiting_host_approval','network')).status()).toBe(200);
  await page.clock.runFor(3000);await expect(page.locator('.waiting-status')).toContainText('Agent 回報需要主機核准');await expect(page.locator('.waiting-explanation')).toContainText('原生核准');await shot(page,'host-approval-pending');
  await page.clock.fastForward(91000);await expect(page.locator('.waiting-status')).toContainText('暫時沒有新的進度');await expect(page.locator('.waiting-explanation')).toContainText('可能仍在處理，也可能已中斷');await shot(page,'stale-signal');
  await page.clock.setFixedTime(new Date());expect((await signal(3,'validating',null)).status()).toBe(200);await page.clock.runFor(3000);await expect(page.locator('.waiting-status')).toContainText('Agent 正在檢查摘要');
  const f=makePartialFixture(s.nickname);f.coverage.sources=['antigravity'];f.tasks=f.tasks.map(t=>({...t,source:'antigravity'}));f.metrics.mostUsedClient='antigravity';f.metrics.mostUsedModelFamily='unknown';f.metrics.modelUsage=[];f.metrics.modelUsageUnit='unknown';
  expect((await request.post('/api/collect/'+s.id,{headers:{Authorization:'Bearer '+s.writeToken,'Idempotency-Key':'agy-sanitized-browser'},data:f})).status()).toBe(201);
  await page.clock.runFor(3000);await expect(page.locator('.app-root')).toHaveAttribute('data-stage','reveal');await expect(page.locator('.card-code')).toHaveText('未定型');await page.getByRole('button',{name:'看看我的觀察',exact:true}).click();await page.locator('.report-details>summary').click();await expect(page.locator('.metrics-list')).toContainText('Antigravity');await expect(page.locator('.metrics-list')).toContainText('尚未確認');await shot(page,'agy-sanitized-report');await remove(page);
});
