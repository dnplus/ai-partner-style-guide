import {test,expect} from '@playwright/test';
import {makeLevelFixture} from '../../lib/fixture.ts';
import {base,create,asNewClient} from './support.ts';

test('an owner opens a board, a member joins by invite, shares, withdraws, and the owner deletes the board',async({browser})=>{
 const ownerContext=await browser.newContext({baseURL:base,locale:'zh-TW'}),owner=await ownerContext.newPage();await asNewClient(owner);
 await owner.goto('/team');await owner.getByPlaceholder('看板名稱').fill('瀏覽器小組');
 await expect(owner.getByRole('button',{name:'建立看板'})).toBeEnabled({timeout:15000});await owner.getByRole('button',{name:'建立看板'}).click();
 await expect(owner.locator('.team-board h1')).toHaveText('瀏覽器小組');await expect(owner.locator('.team-empty')).toBeVisible();
 expect(owner.url()).toMatch(/\/team#[0-9a-f-]{36}\.[0-9a-f]{64}$/);
 const invite=(await owner.locator('.team-links code').textContent())!;expect(invite).toMatch(/\/\?team=[0-9a-f]{32}$/);

 const memberContext=await browser.newContext({baseURL:base,locale:'zh-TW'}),member=await memberContext.newPage();
 await member.goto(invite);await expect(member.locator('.team-pill')).toContainText('瀏覽器小組');expect(member.url()).not.toContain('team=');
 await expect(member.locator('.app-root')).toHaveAttribute('data-ready','true');
 const s=await create(member,'Team Fixture');
 const r=await member.request.post('/api/collect/'+s.id,{headers:{Authorization:'Bearer '+s.writeToken,'Idempotency-Key':'browser-team-'+s.id},data:{...makeLevelFixture(s.nickname),kind:'observed'}});expect(r.status()).toBe(201);
 await expect(member.locator('.app-root')).toHaveAttribute('data-stage','reveal');
 await member.getByPlaceholder('你在團隊中的名字').fill('測試成員');await member.getByRole('button',{name:'分享',exact:true}).click();
 await expect(member.locator('.team-share-title')).toHaveText('已分享到「瀏覽器小組」看板');

 await owner.getByRole('button',{name:'重新整理'}).click();
 const card=owner.locator('.team-member');await expect(card).toHaveCount(1);await expect(card.locator('h2')).toHaveText('測試成員');await expect(card).toContainText('Team Fixture');
 expect(await owner.locator('.team-board').textContent()).not.toMatch(/T001|readToken|writeToken/);

 await member.getByRole('button',{name:'撤回分享'}).click();await expect(member.locator('.team-share-title')).toHaveText('分享到「瀏覽器小組」看板');
 await owner.getByRole('button',{name:'重新整理'}).click();await expect(owner.locator('.team-member')).toHaveCount(0);

 await owner.getByRole('button',{name:'刪除看板'}).click();await owner.getByRole('button',{name:'確定刪除看板'}).click();
 await expect(owner.locator('.inline-notice')).toHaveText('看板已刪除。');
 expect((await member.request.get(invite.replace('/?team=','/api/teams/join/'))).status()).toBe(404);
 await memberContext.close();await ownerContext.close();
});
