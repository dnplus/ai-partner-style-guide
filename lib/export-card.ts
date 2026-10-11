import QRCode from 'qrcode';
import {translator,type Locale} from './i18n.ts';
import type {ArtStyle,Family} from './catalog.ts';
import type {CardObservation} from './assessment.ts';
import {cardComposition,cardSvg,measuredCode,selfContrast} from './card-composition.ts';
export const exportFormats={card:{width:1080,height:1620,label:'收藏卡'},feed:{width:1080,height:1350,label:'直式貼文'},story:{width:1080,height:1920,label:'限時尺寸'},square:{width:1080,height:1080,label:'正方形'},landscape:{width:1200,height:630,label:'橫式貼文'}} as const;
export type ExportFormat=keyof typeof exportFormats;
const imageCache=new Map<string,Promise<string>>();
async function dataImage(src:string){
 if(!imageCache.has(src))imageCache.set(src,fetch(src,{redirect:'error'}).then(async response=>{if(!response.ok)throw new Error('Art unavailable');const blob=await response.blob();return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});}).catch(e=>{imageCache.delete(src);throw e;}));
 return imageCache.get(src)!;
}
export async function makeCardFile(report:CardObservation,style:ArtStyle,family:Family,nicknameOnly:boolean,home:string,locale:Locale='zh-TW',format:ExportFormat='card'){
 const model=cardComposition(report,style,family,nicknameOnly,locale),t=translator(locale),size=exportFormats[format];
 await document.fonts.load('32px '+model.font,model.title+model.nickname);await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('無法建立圖片，請換一個瀏覽器再試。');
 const svg=cardSvg(model,model.art?await dataImage(model.art):'');const image=new Image();const svgURL=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));image.src=svgURL;
 try{await image.decode();}catch{URL.revokeObjectURL(svgURL);throw new Error('圖片匯出失敗');}
 const landscape=format==='landscape',square=format==='square',portrait=!landscape&&!square;
 const bg=ctx.createLinearGradient(0,0,size.width,size.height);bg.addColorStop(0,'#faf7ff');bg.addColorStop(.65,'#e9def8');bg.addColorStop(1,'#c8b4e8');ctx.fillStyle=bg;ctx.fillRect(0,0,size.width,size.height);
 const availableH=size.height-(portrait?270:130);const cardH=Math.min(availableH,format==='card'?1450:format==='story'?1530:2000);const cardW=cardH*2/3;const cardX=landscape?62:square?60:(size.width-cardW)/2,cardY=landscape?43:square?44:40;
 ctx.shadowColor='#30114940';ctx.shadowBlur=32;ctx.shadowOffsetY=20;ctx.drawImage(image,cardX,cardY,cardW,cardH);ctx.shadowBlur=0;ctx.shadowOffsetY=0;URL.revokeObjectURL(svgURL);
 const qr=QRCode.create(home,{errorCorrectionLevel:'M'}),modules=qr.modules,cell=landscape?3:4,qrSize=(modules.size+8)*cell;
 const qrX=landscape?size.width-qrSize-55:square?size.width-qrSize-76:size.width-qrSize-58,qrY=landscape?size.height-qrSize-70:square?size.height-qrSize-100:size.height-qrSize-52;
 ctx.fillStyle='#fff';ctx.fillRect(qrX,qrY,qrSize,qrSize);ctx.fillStyle='#15101e';for(let y=0;y<modules.size;y++)for(let x=0;x<modules.size;x++)if(modules.get(y,x))ctx.fillRect(qrX+(x+4)*cell,qrY+(y+4)*cell,cell,cell);
 const write=(text:string,x:number,y:number,fontSize:number,maxWidth:number,color='#35213f',weight='400')=>{
  ctx.fillStyle=color;ctx.font=weight+' '+fontSize+'px '+model.font;const measured=ctx.measureText(text).width;if(measured>maxWidth)ctx.font=weight+' '+Math.floor(fontSize*maxWidth/measured)+'px '+model.font;ctx.fillText(text,x,y);
 }
 const textX=landscape?440:square?cardX+cardW+46:58,textMax=landscape?680:square?size.width-textX-50:qrX-85;
 if(!portrait){write(model.modelLabel,textX,landscape?122:139,34,textMax);write(model.type?model.type+' · '+model.level:model.nickname,textX,landscape?197:224,landscape?58:48,textMax,'#35213f','600');write(model.title||t('角色卡'),textX,landscape?255:286,31,textMax);if(model.tagline)write(model.tagline,textX,landscape?305:338,24,textMax,'#735d85');}
 const promoY=portrait?size.height-120:landscape?400:460;write(t('你的 Agent，會是哪一型？'),textX,promoY,portrait?28:27,textMax,'#4c345f','600');write(new URL(home).host,textX,promoY+40,19,textMax,'#785e8b');
 write(model.credit,40,size.height-18,landscape?12:16,size.width-80,'#675674');
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('圖片匯出失敗')),'image/png'));
 const filename='agent-mbti-'+family+'-'+style+'-'+locale+'-'+format+'-'+t('角色卡')+(nicknameOnly?'-nickname':'')+'.png';return {file:new File([blob],filename,{type:'image/png'}),width:size.width,height:size.height,composition:model,qr:home,format};
}
export function saveCardFile(file:File){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function downloadCard(report:CardObservation,style:ArtStyle,family:Family,nicknameOnly:boolean,home:string,locale:Locale='zh-TW',format:ExportFormat='card'){
 const result=await makeCardFile(report,style,family,nicknameOnly,home,locale,format);saveCardFile(result.file);return {width:result.width,height:result.height,bytes:result.file.size,locale,filename:result.file.name};
}
export function shareText(report:CardObservation,nicknameOnly:boolean,home:string,locale:Locale='zh-TW',includeBrief=true){
 const t=translator(locale);return [t('你的 Agent MBTI'),report.nickname,...(nicknameOnly?[]:[selfContrast(report,t)||measuredCode(report,t),'LV '+(report.usageLevel.value??'?'),...(includeBrief?report.brief.map(line=>t(line)):[])]),home].join('\n');
}
