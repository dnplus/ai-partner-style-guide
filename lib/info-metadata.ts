import type {Metadata} from 'next';
import {translator,locales,type Locale} from './i18n.ts';
import {localized} from './site-content.ts';
import {requestOrigin} from './request-origin.ts';
import type {TypeCode} from './contract.ts';

export async function infoMetadata(path:string,locale:Locale,title:string,description:string,type?:TypeCode):Promise<Metadata>{
 const base=await requestOrigin(),url=base+localized(path,locale),t=translator(locale);
 const languages:Record<string,string>=Object.fromEntries(locales.map(l=>[l,base+localized(path,l)]));
 languages['x-default']=base+path;
 const image=base+'/og?lang='+locale+(type?'&type='+type:'');
 return {title,description,alternates:{canonical:url,languages},openGraph:{title,description,url,type:'website',siteName:t('你的 AI 夥伴風格指南'),locale:locale.replace('-','_'),images:[{url:image,width:1200,height:630}]},twitter:{card:'summary_large_image',title,description,images:[image]}};
}
