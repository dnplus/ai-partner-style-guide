import {env} from 'cloudflare:workers';
import {guardWrite} from '../../../../lib/abuse-guard.ts';
import {revokePublicCard,loadPublicCard,compareTarget} from '../../../../lib/public-card-service.ts';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
 const {id}=await context.params,data=await loadPublicCard(env.DB,id);
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
 return data?new Response(JSON.stringify(compareTarget(id,data)),{headers}):new Response(JSON.stringify({error:'找不到這張公開卡片。'}),{status:404,headers});
}
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return (await guardWrite(env,request))??revokePublicCard(env.DB,request,id);}
