import {env} from 'cloudflare:workers';
import {loadPublicCard} from '../../../../lib/public-card-service.ts';
import {badgeSvg,badgeColors} from '../../../../lib/badge.ts';
import {rarityFor} from '../../../../lib/card-composition.ts';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params,data=await loadPublicCard(env.DB,id);
 // A revoked or expired card keeps the README tidy: the badge turns into an invitation instead of breaking.
 const card=data&&!data.nicknameOnly?data.card:null;
 const value=card?`${card.assessment.type??card.assessment.pattern} · LV ${card.usageLevel.value??'?'}`:data?'card':'take the test';
 const color=card?badgeColors[rarityFor(card.usageLevel.value)]:data?badgeColors.common:badgeColors.missing;
 return new Response(badgeSvg(value,color),{headers:{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
