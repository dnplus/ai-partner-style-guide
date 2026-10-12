import {test,expect} from '@playwright/test';
import {makeLevelFixture} from '../../lib/fixture.ts';
import {base,ready,create} from './support.ts';

test('a verifiable link mirrors the result on a server-drawn page with a link preview, and revoking it closes the page',async({page,browser})=>{
 await ready(page);const s=await create(page,'Public Fixture');
 const r=await page.request.post('/api/collect/'+s.id,{headers:{Authorization:'Bearer '+s.writeToken,'Idempotency-Key':'browser-public-'+s.id},data:{...makeLevelFixture(s.nickname),kind:'observed'}});expect(r.status()).toBe(201);
 await expect(page.locator('.app-root')).toHaveAttribute('data-stage','reveal');
 await page.getByRole('button',{name:'分享卡片',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'挑個尺寸，分享這一面。'});
 await dialog.getByRole('button',{name:'建立可驗證連結'}).click();
 const url=(await dialog.locator('.verify-link code').textContent())!;expect(url).toMatch(new RegExp('^'+base+'/c/[A-Za-z0-9_-]{22}$'));
 expect(await dialog.locator('.share-text').inputValue()).toContain(url);
 expect(url).not.toContain(s.id);

 const visitor=await browser.newContext({baseURL:base,locale:'zh-TW'}),view=await visitor.newPage();
 const html=await (await visitor.request.get(url)).text();
 expect(html).toContain('<meta property="og:image" content="'+url+'/og"');expect(html).toContain('<meta name="robots" content="noindex, follow"');
 await view.goto(url);await expect(view.locator('.public-card h1')).toHaveText('Public Fixture');await expect(view.locator('.public-verified')).toBeVisible();
 const og=await visitor.request.get(url+'/og');expect(og.status()).toBe(200);expect(og.headers()['content-type']).toBe('image/png');expect((await og.body()).length).toBeGreaterThan(50000);

 await dialog.getByRole('button',{name:'撤回連結'}).click();await expect(dialog.getByRole('button',{name:'建立可驗證連結'})).toBeVisible();
 await view.reload();await expect(view.locator('h1')).toHaveText('這張卡已撤回或過期。');
 expect((await visitor.request.get(url+'/og')).status()).toBe(404);
 await visitor.close();
});
