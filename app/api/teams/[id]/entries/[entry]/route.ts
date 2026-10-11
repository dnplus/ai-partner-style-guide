import {env} from 'cloudflare:workers';
import {guardWrite} from '../../../../../../lib/abuse-guard.ts';
import {handleTeam} from '../../../../../../lib/team-service.ts';
type Context={params:Promise<{id:string;entry:string}>};
export async function DELETE(request:Request,context:Context){const {id,entry}=await context.params;return (await guardWrite(env,request))??handleTeam(env.DB,request,{team:id,entry});}
