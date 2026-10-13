import {env} from 'cloudflare:workers';
import {loadPublicCard} from '../../../../../lib/public-card-service.ts';
import {ogCompareImage} from '../../../../../lib/og-image.tsx';
import {compareAssessments} from '../../../../../lib/compare.ts';
import {cachedImage,contentKey} from '../../../../../lib/og-cache.ts';
export async function GET(request:Request,context:{params:Promise<{a:string;b:string}>}){
 const {a,b}=await context.params,[first,second]=await Promise.all([loadPublicCard(env.DB,a),loadPublicCard(env.DB,b)]);
 if(!first||!second||first.nicknameOnly||second.nicknameOnly||!first.card.assessment.type||!second.card.assessment.type)return new Response('Not found',{status:404});
 const result=compareAssessments(first.card.assessment,second.card.assessment);
 const side=(c:typeof first)=>({type:c.card.assessment.type!,family:c.family,style:c.style,letters:c.card.assessment.axes.map(axis=>axis.value)});
 return cachedImage(request,'vs/'+a+'/'+b+'/'+await contentKey([first,second]),()=>ogCompareImage(request,{a:side(first),b:side(second),kind:result.kind,same:result.same,known:result.known,locale:second.locale}));
}
