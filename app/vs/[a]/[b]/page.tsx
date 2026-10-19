import {env} from 'cloudflare:workers';
import {headers} from 'next/headers';
import type {Metadata} from 'next';
import {requestOrigin} from '../../../../lib/request-origin.ts';
import {loadPublicCard} from '../../../../lib/public-card-service.ts';
import {ComparePageView} from '../../../../components/compare-page.tsx';
import {translator} from '../../../../lib/i18n.ts';
import {compareAssessments} from '../../../../lib/compare.ts';
import {countStep,isCrawler} from '../../../../lib/funnel.ts';

type Props={params:Promise<{a:string;b:string}>};
export const dynamic='force-dynamic';
async function load(params:Props['params']){
 const {a,b}=await params,[first,second]=await Promise.all([loadPublicCard(env.DB,a),loadPublicCard(env.DB,b)]);
 return {a,b,first,second,valid:!!first&&!!second&&!first.nicknameOnly&&!second.nicknameOnly};
}
// Like the personal cards, a comparison stays out of search results; its link preview shows both cards.
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {a,b,first,second,valid}=await load(params),base=await requestOrigin();
 if(!valid)return {title:'你的 AI 夥伴風格指南',robots:{index:false,follow:false}};
 const t=translator(second!.locale),result=compareAssessments(first!.card.assessment,second!.card.assessment),url=`${base}/vs/${a}/${b}`,image=url+'/og';
 const title=`${first!.card.nickname} × ${second!.card.nickname}｜${t(result.kind)}`,description=t('{same} / {known} 軸相同',{same:result.same,known:result.known});
 return {title,description,robots:{index:false,follow:true},alternates:{canonical:url},openGraph:{title,description,url,type:'website',siteName:t('你的 AI 夥伴風格指南'),images:[{url:image,width:1200,height:630}]},twitter:{card:'summary_large_image',title,description,images:[image]}};
}
export default async function ComparePage({params}:Props){
 const {b,first,second,valid}=await load(params);
 if(valid&&!isCrawler((await headers()).get('user-agent')))await countStep(env.DB,'card_view','link');
 return <ComparePageView a={first} b={second} bId={b}/>;
}
