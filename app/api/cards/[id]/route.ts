import {env} from 'cloudflare:workers';
import {guardWrite} from '../../../../lib/abuse-guard.ts';
import {revokePublicCard} from '../../../../lib/public-card-service.ts';
export async function DELETE(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return (await guardWrite(env,request))??revokePublicCard(env.DB,request,id);}
