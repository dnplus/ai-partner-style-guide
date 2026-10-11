import {env} from 'cloudflare:workers';
import {guardWrite} from '../../../../../lib/abuse-guard.ts';
import {handleTeam} from '../../../../../lib/team-service.ts';
type Context={params:Promise<{code:string}>};
export async function GET(request:Request,context:Context){const {code}=await context.params;return (await guardWrite(env,request))??handleTeam(env.DB,request,{code});}
