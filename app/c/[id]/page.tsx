import {env} from 'cloudflare:workers';
import {requestOrigin} from '../../../lib/request-origin.ts';
import type {Metadata} from 'next';
import {loadPublicCard} from '../../../lib/public-card-service.ts';
import {PublicCardView} from '../../../components/public-card.tsx';
import {translator} from '../../../lib/i18n.ts';
import {personaFor} from '../../../lib/catalog.ts';
import {measuredCode} from '../../../lib/card-composition.ts';
import {rarityLabel} from '../../../lib/rarity.ts';
import {headers} from 'next/headers';
import {countStep,funnelSource,isCrawler} from '../../../lib/funnel.ts';

type Props={params:Promise<{id:string}>;searchParams:Promise<{via?:string}>};
export const dynamic='force-dynamic';
// Personal cards stay out of search results, but their link previews show the server-drawn card.
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {id}=await params,data=await loadPublicCard(env.DB,id),base=await requestOrigin();
 if(!data)return {title:'你的 AI 夥伴風格指南',robots:{index:false,follow:false}};
 const t=translator(data.locale),card=data.card,url=base+'/c/'+id,image=url+'/og';
 const summary=data.nicknameOnly?t('你的 AI 夥伴風格指南'):`${measuredCode(card,t)} ${t(personaFor(card.assessment.type).name)} · ${t(rarityLabel(card.usageLevel.value))}`;
 const title=`${card.nickname}｜${summary}`,description=data.nicknameOnly?t('你的 Agent，會是哪一型？'):card.brief.map(line=>t(line)).join(' ');
 return {title,description,robots:{index:false,follow:true},alternates:{canonical:url},openGraph:{title,description,url,type:'website',siteName:t('你的 AI 夥伴風格指南'),images:[{url:image,width:1200,height:630}]},twitter:{card:'summary_large_image',title,description,images:[image]}};
}
export default async function PublicCardPage({params,searchParams}:Props){
 const {id}=await params,data=await loadPublicCard(env.DB,id);
 // An untagged view came from a pasted link; the tag rides along to the home page so the visit keeps its source.
 const via=funnelSource((await searchParams).via)??'link';
 if(data&&!isCrawler((await headers()).get('user-agent')))await countStep(env.DB,'card_view',via);
 return <PublicCardView id={id} via={via} data={data}/>;
}
