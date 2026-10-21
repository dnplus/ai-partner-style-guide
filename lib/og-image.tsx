import {ImageResponse} from 'next/og';
import {env} from 'cloudflare:workers';
import {translator,type Locale} from './i18n.ts';
import {families,personaFor,type ArtStyle,type Family} from './catalog.ts';
import {rarityFor,rarityLabel} from './rarity.ts';
import {ogFontFamily,ogFontFile} from './og-text.ts';
import type {AxisResult,TypeCode} from './contract.ts';

export type OgCard={type:TypeCode|null;axes:AxisResult[]|null;level:number|null|undefined;family:Family;style:ArtStyle;locale:Locale};
const frames={common:'#93869e',rare:'linear-gradient(135deg,#e2bfff,#9affdf 30%,#ffe1b0 55%,#ac83f5 80%,#f3b4db)',epic:'linear-gradient(135deg,#f0dcff,#9affdf 25%,#c9a6ff 50%,#ffe1b0 75%,#ac83f5)',legendary:'linear-gradient(135deg,#fff3c8,#f0c35f 30%,#fff8de 55%,#c8922f 80%,#ffe6a3)'};

async function asset(origin:string,path:string){
 const response=await env.ASSETS.fetch(new Request(origin+path));
 return response.ok?await response.arrayBuffer():null;
}

// The preview draws only fixed strings (type, persona, level) so it never needs the visitor-chosen nickname or a remote font.
async function fontsFor(origin:string,locale:Locale){
 const latin=ogFontFamily.en,local=ogFontFamily[locale];
 const [latinFont,serifFont,localFont]=await Promise.all([asset(origin,ogFontFile(latin)),asset(origin,ogFontFile('Noto Serif')),local===latin?Promise.resolve(null):asset(origin,ogFontFile(local))]);
 return {latin,local,fonts:[{name:latin,data:latinFont!,weight:700 as const},{name:'Noto Serif',data:serifFont!,weight:700 as const},...(localFont?[{name:local,data:localFont,weight:700 as const}]:[])]};
}
const artPath=(family:Family,type:TypeCode,style:ArtStyle)=>'/og/art/'+family+'/'+type.toLowerCase()+'-'+style+'.jpg';
const jpeg=(art:ArrayBuffer)=>'data:image/jpeg;base64,'+Buffer.from(art).toString('base64');

export async function ogImage(request:Request,card:OgCard){
 const origin=new URL(request.url).origin,t=translator(card.locale),theme=families.find(f=>f.id===card.family)!;
 const [art,{latin,local,fonts}]=await Promise.all([card.type?asset(origin,artPath(card.family,card.type,card.style)):Promise.resolve(null),fontsFor(origin,card.locale)]);
 const rarity=card.level===undefined?'common':rarityFor(card.level);
 const showLevel=card.level!==undefined;
 const letters=card.axes?card.axes.map(axis=>({letter:axis.value,lean:axis.strength==='lean'})):[...(card.type??'????')].map(letter=>({letter,lean:false}));
 const accent=rarity==='legendary'?'#f6d27a':'#c9a6ff';
 const element=<div style={{width:1200,height:630,display:'flex',alignItems:'center',gap:56,padding:'0 72px',background:'linear-gradient(135deg,#120d19 0%,#241a31 55%,#1a1324 100%)',fontFamily:`${local}, ${latin}`,color:'#ede4fa'}}>
  <div style={{display:'flex',padding:8,borderRadius:34,background:frames[rarity],boxShadow:'0 30px 60px rgba(0,0,0,0.45)'}}>
   <div style={{display:'flex',width:330,height:495,borderRadius:28,background:'#1a1422',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
    {/* eslint-disable-next-line @next/next/no-img-element -- satori draws plain img elements; next/image does not apply */}
    {art?<img src={jpeg(art)} width={330} height={495} style={{objectFit:'contain'}}/>:<div style={{display:'flex',fontSize:120,color:'#e2cef9'}}>?</div>}
   </div>
  </div>
  <div style={{display:'flex',flexDirection:'column',flex:1,height:495}}>
   <div style={{display:'flex',fontSize:30,color:'#bba4d4',letterSpacing:2}}>{t('你的 AI 夥伴風格指南')} · {theme.label.toUpperCase()}</div>
   <div style={{display:'flex',fontFamily:'Noto Serif',fontSize:168,lineHeight:1.05,marginTop:18,color:accent}}>{letters.map((l,i)=><span key={i} style={{opacity:l.lean?0.38:1}}>{l.letter}</span>)}</div>
   <div style={{display:'flex',fontSize:56,marginTop:8}}>{card.type?t(personaFor(card.type).name):t('未定型')}</div>
   {showLevel&&<div style={{display:'flex',marginTop:30}}><div style={{display:'flex',alignItems:'center',gap:14,padding:'12px 26px',borderRadius:22,border:`3px solid ${rarity==='common'?'#c1a2e6':accent}`,fontSize:34}}><span>{t(rarityLabel(card.level??null))}</span><span style={{fontSize:24,color:'#c9b7de'}}>{t('卡片稀有度')}</span></div></div>}
   <div style={{display:'flex',flexDirection:'column',marginTop:'auto',paddingTop:32,fontSize:26,color:'#a893bd'}}><span>{t('你的 Agent，會是哪一型？')}</span><span style={{fontSize:22,marginTop:6,whiteSpace:'nowrap'}}>{new URL(request.url).host}</span></div>
  </div>
 </div>;
 return new ImageResponse(element,{width:1200,height:630,fonts,headers:{'Cache-Control':'public, max-age=3600'}});
}

export type OgCompareSide={type:TypeCode;family:Family;style:ArtStyle;letters:string[]};
// Two cards facing each other, with the pairing's name: no nicknames, so the fonts stay fixed subsets.
export async function ogCompareImage(request:Request,data:{a:OgCompareSide;b:OgCompareSide;kind:string;same:number;known:number;locale:Locale}){
 const origin=new URL(request.url).origin,t=translator(data.locale);
 const [artA,artB,{latin,local,fonts}]=await Promise.all([asset(origin,artPath(data.a.family,data.a.type,data.a.style)),asset(origin,artPath(data.b.family,data.b.type,data.b.style)),fontsFor(origin,data.locale)]);
 const side=(art:ArrayBuffer|null,letters:string[])=><div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14}}>
  <div style={{display:'flex',padding:6,borderRadius:28,background:frames.rare}}><div style={{display:'flex',width:250,height:375,borderRadius:23,background:'#1a1422',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
   {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- satori draws plain img elements */}
   {art?<img src={jpeg(art)} width={250} height={375} style={{objectFit:'contain'}}/>:<div style={{display:'flex',fontSize:90,color:'#e2cef9'}}>?</div>}
  </div></div>
  <div style={{display:'flex',fontFamily:'Noto Serif',fontSize:64,color:'#c9a6ff',letterSpacing:2}}>{letters.join('')}</div>
 </div>;
 const element=<div style={{width:1200,height:630,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 70px',background:'linear-gradient(135deg,#120d19 0%,#241a31 55%,#1a1324 100%)',fontFamily:`${local}, ${latin}`,color:'#ede4fa'}}>
  {side(artA,data.a.letters)}
  <div style={{display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',width:380}}>
   <div style={{display:'flex',fontSize:26,color:'#bba4d4',letterSpacing:2}}>{t('你的 AI 夥伴風格指南')}</div>
   <div style={{display:'flex',fontSize:84,color:'#f6d27a',marginTop:14}}>×</div>
   <div style={{display:'flex',fontSize:54,marginTop:10}}>{t(data.kind)}</div>
   {data.known>=2&&<div style={{display:'flex',fontSize:30,marginTop:16,color:'#c9b7de'}}>{t('{same} / {known} 軸相同',{same:data.same,known:data.known})}</div>}
   <div style={{display:'flex',fontSize:22,marginTop:40,color:'#a893bd',whiteSpace:'nowrap'}}>{new URL(request.url).host}</div>
  </div>
  {side(artB,data.b.letters)}
 </div>;
 return new ImageResponse(element,{width:1200,height:630,fonts,headers:{'Cache-Control':'public, max-age=3600'}});
}
