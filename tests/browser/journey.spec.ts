import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {makeFixture} from '../../lib/fixture.ts';

test('desktop form → callback → report → both styles → PNG → nickname-only → delete',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('.app-root')).toHaveAttribute('data-ready','true');await expect(page.getByRole('heading',{level:1})).toHaveText('你怎麼用 AI，就有什麼專屬形態。');
  await page.locator('.card-art img').evaluate((img:HTMLImageElement)=>img.decode());
  await page.screenshot({animations:'disabled',path:'evidence/desktop-home.png'});
  await page.getByRole('button',{name:'召喚我的角色',exact:true}).click();
  await page.getByRole('textbox',{name:/卡片暱稱/}).fill('測試星河');
  await page.getByRole('textbox',{name:/Email/}).fill('fixture@example.test');
  await expect(page.getByRole('checkbox',{name:/我同意 Email/})).toBeVisible();
  await page.getByRole('checkbox',{name:/我同意 Email/}).check();
  await page.screenshot({animations:'disabled',path:'evidence/desktop-form.png'});
  const created=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'建立我的專屬指令',exact:true}).click();
  const session=await (await created).json();
  await expect(page.getByRole('button',{name:'複製專屬指令',exact:true})).toBeVisible();
  const instructions=await page.getByRole('textbox',{name:'貼給 Agent 的指令'}).inputValue();
  expect(instructions).toContain(session.id);expect(instructions).not.toContain('fixture@example.test');expect(instructions).not.toContain(session.readToken);
  const clipboard=await page.evaluate(()=>navigator.clipboard.writeText('qa clipboard marker').then(()=>true).catch(()=>false));
  if(clipboard){await page.getByRole('button',{name:'複製專屬指令',exact:true}).click();await expect(page.getByRole('button',{name:'已複製，貼給你的 Agent',exact:true})).toBeVisible();}
  const response=await request.post(`/api/collect/${session.id}`,{headers:{Authorization:`Bearer ${session.writeToken}`,'Idempotency-Key':'browser-integration-key'},data:makeFixture('測試星河')});
  expect(response.status()).toBe(201);
  await expect(page.locator('.session-dialog')).not.toBeVisible();
  await expect(page.getByRole('heading',{level:1})).toContainText('測試星河');
  await expect(page.locator('.result-label')).toContainText('示範資料');
  await expect(page.locator('.axes-grid>div')).toHaveCount(4);
  await expect(page.locator('.metrics-list')).toContainText('OpenAI / GPT');
  expect(page.url()).not.toContain('測試');expect(page.url()).not.toContain(session.readToken);
  await page.reload();await expect(page.locator('.app-root')).toHaveAttribute('data-ready','true');await expect(page.getByRole('heading',{level:1})).toContainText('測試星河');
  const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ai-persona-session-v1')!));expect(saved).not.toHaveProperty('writeToken');
  const before=await page.getByTestId('holo-card').getAttribute('style');
  await page.getByTestId('holo-card').press('ArrowRight');
  await expect.poll(()=>page.getByTestId('holo-card').getAttribute('style')).not.toBe(before);
  await page.screenshot({animations:'disabled',path:'evidence/desktop-report-regular.png'});
  const downloadRegular=page.waitForEvent('download');await page.getByRole('button',{name:'下載我的角色卡',exact:true}).click();await (await downloadRegular).saveAs('evidence/report-regular.png');
  const png=await readFile('evidence/report-regular.png');expect(png.readUInt32BE(16)).toBe(1080);expect(png.readUInt32BE(20)).toBe(1620);
  await page.getByRole('button',{name:'Q 版',exact:true}).click();await expect(page.locator('.card-art img')).toHaveAttribute('src','/art/codex-pvse-chibi.png');await page.locator('.card-art img').evaluate((img:HTMLImageElement)=>img.decode());
  await page.screenshot({animations:'disabled',path:'evidence/desktop-report-chibi.png'});
  const downloadChibi=page.waitForEvent('download');await page.getByRole('button',{name:'下載我的角色卡',exact:true}).click();await (await downloadChibi).saveAs('evidence/report-chibi.png');
  await page.getByRole('checkbox',{name:'只顯示暱稱，隱藏等級與分型',exact:true}).check();
  await expect(page.locator('.card-code')).toHaveCount(0);await expect(page.locator('.card-level')).toHaveCount(0);
  const nicknameDownload=page.waitForEvent('download');await page.getByRole('button',{name:'下載我的角色卡',exact:true}).click();await (await nicknameDownload).saveAs('evidence/report-nickname-only.png');
  await page.getByLabel('卡面主題',{exact:true}).selectOption('gemini');await expect(page.locator('.card-art img')).toHaveAttribute('src','/art/gemini-pvse-chibi.png');
  await expect(page.getByRole('heading',{level:1})).toContainText('PVSE');
  await page.locator('#report').scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:'evidence/report-details.png'});
  await page.getByRole('button',{name:'刪除此結果',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toContainText('你怎麼用 AI');
  expect((await request.get(`/api/sessions/${session.id}`,{headers:{Authorization:`Bearer ${session.readToken}`}})).status()).toBe(404);
  expect(errors).toEqual([]);
});

test('mobile 390×844: real touch drag, Q toggle, dialog and no horizontal overflow',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();await page.goto('http://127.0.0.1:5188');await expect(page.locator('.app-root')).toHaveAttribute('data-ready','true');
  await page.locator('.card-art img').evaluate((img:HTMLImageElement)=>img.decode());
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({animations:'disabled',path:'evidence/mobile-home.png',fullPage:true});
  const card=page.getByTestId('holo-card');await card.scrollIntoViewIfNeeded();
  const box=(await card.boundingBox())!;const devtools=await context.newCDPSession(page);
  const before=await card.getAttribute('style');
  await devtools.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.4,y:box.y+box.height*.5}]});
  await devtools.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*.8,y:box.y+box.height*.3}]});
  await devtools.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>card.getAttribute('style')).not.toBe(before);
  await page.getByRole('button',{name:'Q 版',exact:true}).click();await expect(page.locator('.card-art img')).toHaveAttribute('src','/art/codex-pvse-chibi.png');await page.locator('.card-art img').evaluate((img:HTMLImageElement)=>img.decode());
  await card.scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:'evidence/mobile-chibi.png'});
  await page.getByRole('button',{name:'召喚我的角色',exact:true}).click();await expect(page.locator('dialog[open]')).toBeVisible();
  const dialogBox=(await page.locator('dialog[open]').boundingBox())!;expect(dialogBox.x).toBeGreaterThanOrEqual(0);expect(dialogBox.width).toBeLessThanOrEqual(390);
  await page.screenshot({animations:'disabled',path:'evidence/mobile-form.png'});await context.close();
});

test('reduced motion disables tilt while retaining static artwork and export',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await expect(page.locator('.app-root')).toHaveAttribute('data-ready','true');
  const card=page.getByTestId('holo-card');const transform=await card.evaluate(el=>getComputedStyle(el).transform);
  await card.press('ArrowRight');expect(await card.evaluate(el=>getComputedStyle(el).transform)).toBe(transform);
  await expect(page.locator('.reduced-hint')).toBeVisible();
  await page.getByRole('button',{name:'Q 版',exact:true}).click();await expect(page.getByRole('button',{name:'Q 版',exact:true})).toHaveAttribute('aria-pressed','true');await page.locator('.card-art img').evaluate((img:HTMLImageElement)=>img.decode());
  await page.screenshot({animations:'disabled',path:'evidence/reduced-motion.png'});
  await page.getByRole('button',{name:'先看示範',exact:true}).click();const d=page.waitForEvent('download');await page.getByRole('button',{name:'下載我的角色卡',exact:true}).click();expect((await d).suggestedFilename()).toContain('chibi');
});

test('catalog is truthful and unknown/tied metadata can reach a real report',async({page,request})=>{
  await page.goto('/');await expect(page.locator('.app-root')).toHaveAttribute('data-ready','true');await page.locator('.type-grid button').filter({hasText:'QVSE'}).click();await expect(page.locator('.type-description')).toContainText('插圖尚未製作');
  await page.getByRole('button',{name:'召喚我的角色',exact:true}).click();await page.getByRole('textbox',{name:/卡片暱稱/}).fill('未知旅人');
  const created=page.waitForResponse(r=>r.url().endsWith('/api/sessions')&&r.request().method()==='POST');await page.getByRole('button',{name:'建立我的專屬指令',exact:true}).click();const s=await(await created).json();
  const f=makeFixture('未知旅人');f.axes.preparation={value:'?',cases:[]};f.assessment.type='?VSE';f.metrics.modelUsage=[];f.metrics.modelUsageUnit='unknown';f.metrics.mostUsedModelFamily='unknown';
  expect((await request.post(`/api/collect/${s.id}`,{headers:{Authorization:`Bearer ${s.writeToken}`,'Idempotency-Key':'unknown-metadata-test'},data:f})).status()).toBe(201);
  await expect(page.getByRole('heading',{level:1})).toContainText('?VSE');await expect(page.locator('.axes-grid')).toContainText('資料不足');await expect(page.locator('.art-pending')).toBeVisible();
  await page.getByRole('button',{name:'刪除此結果',exact:true}).click();
});


test('all twelve PVSE artworks load without changing the assessment or observed model',async({page})=>{
  await page.goto('/');await expect(page.locator('.app-root')).toHaveAttribute('data-ready','true');
  await page.getByRole('button',{name:'先看示範',exact:true}).click();
  for(const family of ['codex','claude','gemini','grok','deepseek','glm']){
    await page.getByLabel('卡面主題',{exact:true}).selectOption(family);
    for(const style of ['regular','chibi']){
      await page.getByRole('button',{name:style==='regular'?'一般':'Q 版',exact:true}).click();
      const img=page.locator('.card-art img');await expect(img).toHaveAttribute('src',`/art/${family}-pvse-${style}.png`);
      expect(await img.evaluate(async(img:HTMLImageElement)=>{await img.decode();return [img.naturalWidth,img.naturalHeight];})).toEqual([1024,1536]);
      await expect(page.getByRole('heading',{level:1})).toContainText('PVSE');await expect(page.locator('.metrics-list')).toContainText('OpenAI / GPT');
      if(style==='regular')await page.screenshot({animations:'disabled',path:`evidence/family-${family}.png`});
    }
  }
  await expect(page.locator('.type-description')).toContainText('12 / 192');
});
