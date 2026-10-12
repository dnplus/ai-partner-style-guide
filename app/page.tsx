import {env} from 'cloudflare:workers';
import type {Metadata} from 'next';
import {PersonaApp} from '../components/persona-app.tsx';
import {JsonLd} from '../components/info-shell.tsx';
import {translator,locales} from '../lib/i18n.ts';
import {siteDescription} from '../lib/site-content.ts';
import {requestOrigin} from '../lib/request-origin.ts';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{
 const base=await requestOrigin(),t=translator('zh-TW'),title=t('你的 Agent MBTI')+'｜'+t('你的 Agent，會是哪一型？'),description=siteDescription('zh-TW'),image=base+'/og';
 return {title,description,alternates:{canonical:base+'/'},openGraph:{title,description,url:base+'/',type:'website',siteName:t('你的 Agent MBTI'),images:[{url:image,width:1200,height:630}]},twitter:{card:'summary_large_image',title,description,images:[image]}};
}
export default async function Home(){
 const base=await requestOrigin(),t=translator('zh-TW');
 return <><PersonaApp turnstileSiteKey={env.TURNSTILE_SITE_KEY}/><JsonLd data={{'@context':'https://schema.org','@type':'WebApplication','name':t('你的 Agent MBTI'),'url':base+'/','description':siteDescription('zh-TW'),'applicationCategory':'LifestyleApplication','operatingSystem':'Any','inLanguage':[...locales],'isAccessibleForFree':true,'offers':{'@type':'Offer','price':0,'priceCurrency':'USD'}}}/></>;
}
