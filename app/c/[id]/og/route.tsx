import {env} from 'cloudflare:workers';
import {loadPublicCard} from '../../../../lib/public-card-service.ts';
import {ogImage} from '../../../../lib/og-image.tsx';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params,data=await loadPublicCard(env.DB,id);
 if(!data)return new Response('Not found',{status:404});
 const {card}=data;
 return ogImage(request,{type:data.nicknameOnly?null:card.assessment.type,axes:data.nicknameOnly?null:card.assessment.axes,level:data.nicknameOnly?undefined:card.usageLevel.value,family:data.family,style:data.style,locale:data.locale});
}
