import {translator,locales,type Locale} from './i18n.ts';
import {personas,personaFor} from './catalog.ts';
import {levelNames} from './usage-level.ts';

// The social preview only draws these fixed strings, so its fonts can be small subsets committed with the code.
export const ogFontFamily:Record<Locale,string>={'zh-TW':'Noto Sans TC','zh-CN':'Noto Sans SC',ja:'Noto Sans JP',ko:'Noto Sans KR',en:'Noto Sans'};
export function ogStrings(locale:Locale){
 const t=translator(locale);
 return [t('你的 AI 夥伴風格指南'),t('你的 Agent，會是哪一型？'),t('待觀察'),t('未定型'),t(personaFor(null).name),...Object.values(personas).map(p=>t(p.name)),...levelNames.map(name=>t(name))];
}
// Latin glyphs every preview needs: type letters, the level, the host and the English copy.
export const OG_LATIN=' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789?.,:/-·×+&\'';
export function ogFontText(){
 const text:Record<string,string>={};
 for(const locale of locales){
  const family=ogFontFamily[locale];
  const chars=new Set([...(text[family]??''),...ogStrings(locale).join('')]);
  text[family]=[...chars].sort().join('');
 }
 text['Noto Sans']=[...new Set([...(text['Noto Sans']??''),...OG_LATIN])].sort().join('');
 text['Noto Serif']='?EFIJNPST';
 return text;
}
export const ogFontFile=(family:string)=>'/og/fonts/'+family.toLowerCase().replaceAll(' ','-')+'.ttf';
