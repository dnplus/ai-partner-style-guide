import {ogImage} from '../../lib/og-image.tsx';
import {cachedImage} from '../../lib/og-cache.ts';
import {typeCodes,type TypeCode} from '../../lib/contract.ts';
import {families,type Family} from '../../lib/catalog.ts';
import {locales,type Locale} from '../../lib/i18n.ts';
// The site and type pages share one preview: a type's card without any level or nickname.
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const type=(typeCodes.find(code=>code===params.get('type'))??'INTJ') as TypeCode;
 const family=(families.find(f=>f.id===params.get('family'))?.id??'codex') as Family;
 const locale=(locales.find(l=>l===params.get('lang'))??'zh-TW') as Locale;
 const style=params.get('style')==='regular'?'regular':'chibi';
 // Same inputs, same picture; the hour-long max-age bounds how long a deploy's new copy takes to show.
 return cachedImage(request,['site',type,family,style,locale].join('/'),()=>ogImage(request,{type,axes:null,level:undefined,family,style,locale}));
}
