import {env} from 'cloudflare:workers';
import {guardWrite} from '../../../../lib/abuse-guard.ts';
import {createPublicCard} from '../../../../lib/public-card-service.ts';
export async function POST(request:Request){return (await guardWrite(env,request))??createPublicCard(env.DB,request);}
