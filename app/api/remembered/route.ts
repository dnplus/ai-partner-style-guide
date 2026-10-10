import {getChatGPTUser} from '../../chatgpt-auth.ts';
import {env} from 'cloudflare:workers';
import {handleRemembered} from '../../../lib/remembered-service.ts';
import {json} from '../../../lib/session-service.ts';
export async function GET(request:Request){return env.DB?handleRemembered(env.DB,request,Date.now(),await getChatGPTUser()):json({error:'Storage unavailable'},503);}
export const POST=GET;
export const DELETE=GET;
