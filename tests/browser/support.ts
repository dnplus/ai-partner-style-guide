import {expect,type Page,type APIRequestContext} from '@playwright/test';
import {translator,type Locale} from '../../lib/i18n.ts';
import {makeLevelFixture} from '../../lib/fixture.ts';
export const base='http://127.0.0.1:5188';
export type Session={id:string;readToken:string;writeToken:string;nickname:string;expiresAt:number};
export const dummyTurnstileToken='XXXX.DUMMY.TOKEN.XXXX';
// The per-IP create limit is 5/min; each simulated visitor gets its own CF-Connecting-IP.
// Only app API calls carry it: Turnstile's own cross-origin requests would fail CORS with an extra header.
export async function asNewClient(page:Page){
 const ip=`198.18.${Math.floor(Math.random()*256)}.${1+Math.floor(Math.random()*254)}`,api=base+'/api/**',context=page.context();
 await context.unroute(api);await context.route(api,route=>route.continue({headers:{...route.request().headers(),'CF-Connecting-IP':ip}}));return ip;
}
export async function ready(page:Page){await page.goto('/');await expect(page.locator('.app-root')).toHaveAttribute('data-ready','true');}
export async function create(page:Page,nickname='Browser Fixture',locale:Locale='zh-TW'):Promise<Session>{const t=translator(locale);await page.getByRole('button',{name:t('開始觀察'),exact:true}).click();await expect(page.locator('.journey-progress')).toHaveAttribute('aria-label',t('第 {step} 個階段，共 3 個階段',{step:1}));await page.locator('#nickname').fill(nickname);await expect(page.locator('#email')).toHaveCount(0);await asNewClient(page);const next=page.waitForResponse(r=>r.url()===base+'/api/sessions'&&r.request().method()==='POST');await page.getByRole('button',{name:t('建立我的連結'),exact:true}).click();const response=await next;expect(response.status()).toBe(201);await expect(page.locator('.app-root')).toHaveAttribute('data-stage','instructions');return await response.json();}
export async function submit(page:Page,request:APIRequestContext,s:Session,payload=makeLevelFixture(s.nickname)){const r=await request.post('/api/collect/'+s.id,{headers:{Authorization:'Bearer '+s.writeToken,'Idempotency-Key':'browser-summary-'+s.id},data:payload});expect(r.status()).toBe(201);await expect(page.locator('.app-root')).toHaveAttribute('data-stage','reveal');}
export async function remove(page:Page,locale:Locale='zh-TW'){await page.getByRole('button',{name:translator(locale)('清除這次結果'),exact:true}).click();await expect(page.locator('.app-root')).toHaveAttribute('data-stage','cover');}
