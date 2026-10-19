import {test,expect} from '@playwright/test';
import {makeLevelFixture} from '../../lib/fixture.ts';
import {base,ready,create,asNewClient} from './support.ts';

test('a visitor from a public card compares with its owner, shares the pair, and the badge mirrors the card',async({page,browser})=>{
 test.setTimeout(90000);await ready(page);const a=await create(page,'Compare Owner');
 expect((await page.request.post('/api/collect/'+a.id,{headers:{Authorization:'Bearer '+a.writeToken,'Idempotency-Key':'browser-compare-'+a.id},data:{...makeLevelFixture(a.nickname),kind:'observed'}})).status()).toBe(201);
 await page.getByRole('button',{name:'分享卡片',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'挑個尺寸，分享這一面。'});
 await dialog.getByRole('button',{name:'建立可驗證連結'}).click();
 const url=(await dialog.locator('.verify-link code').textContent())!,ownerId=url.split('/c/')[1];
 const badge=await page.request.get(url+'/badge.svg');expect(badge.headers()['content-type']).toContain('image/svg+xml');expect(await badge.text()).toContain('INTJ · LV 4');

 const visitor=await browser.newContext({baseURL:base,locale:'zh-TW'}),view=await visitor.newPage();await asNewClient(view);
 await view.goto(url);
 const cta=view.getByRole('link',{name:'測完和 Compare Owner 比一比'});await expect(cta).toHaveAttribute('href','/?vs='+ownerId+'&via=link');
 await cta.click();await expect(view.locator('.team-pill')).toContainText('測完會和 Compare Owner 比一比');
 const b=await create(view,'Compare Guest');
 const flipped={...makeLevelFixture(b.nickname),kind:'observed'};flipped.tasks=flipped.tasks.map(task=>({...task,axes:{...task.axes,EI:'E' as const}}));
 expect((await view.request.post('/api/collect/'+b.id,{headers:{Authorization:'Bearer '+b.writeToken,'Idempotency-Key':'browser-compare-'+b.id},data:flipped})).status()).toBe(201);
 await expect(view.locator('.app-root')).toHaveAttribute('data-stage','reveal');
 await expect(view.locator('.journey-progress')).toHaveCount(0);
 await expect(view.locator('.compare-view .compare-kind b')).toHaveText('默契搭檔');
 await expect(view.locator('.compare-row.diff')).toHaveCount(1);

 await view.evaluate(()=>{const w=window as unknown as {posted:string[]};w.posted=[];Object.defineProperty(navigator,'share',{configurable:true,value:(d:ShareData)=>{w.posted.push(d.text!);return Promise.resolve();}});});
 await view.getByRole('button',{name:'分享比較結果',exact:true}).click();
 await expect.poll(()=>view.evaluate(()=>(window as unknown as {posted:string[]}).posted.length)).toBe(1);
 const post=await view.evaluate(()=>(window as unknown as {posted:string[]}).posted[0]);
 const pair=post.match(new RegExp(base+'/vs/'+ownerId+'/[A-Za-z0-9_-]{22}'))?.[0];expect(pair).toBeTruthy();expect(post).toContain('默契搭檔');

 await view.goto(pair!);await expect(view.locator('.compare-page h1')).toContainText('Compare Owner');await expect(view.locator('.compare-page h1')).toContainText('Compare Guest');
 const html=await (await visitor.request.get(pair!)).text();expect(html).toContain('<meta property="og:image" content="'+pair+'/og"');expect(html).toContain('noindex');
 const og=await visitor.request.get(pair!+'/og');expect(og.status()).toBe(200);expect(og.headers()['content-type']).toBe('image/png');
 // The second fetch is served from the edge cache and must be just as good.
 const cached=await visitor.request.get(pair!+'/og');expect(cached.status()).toBe(200);expect((await cached.body()).length).toBe((await og.body()).length);
 await visitor.close();
});
