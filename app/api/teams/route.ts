import {env} from 'cloudflare:workers';
import {guardCreate} from '../../../lib/abuse-guard.ts';
import {handleTeam} from '../../../lib/team-service.ts';
export async function POST(request:Request){return (await guardCreate(env,request))??handleTeam(env.DB,request,{});}
