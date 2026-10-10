import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth.ts';
import {handleAccount} from '../../../lib/account-service.ts';
import {json} from '../../../lib/session-service.ts';
export async function GET(request:Request){return env.DB?handleAccount(env.DB,request,await getChatGPTUser()):json({error:'Storage unavailable'},503);}
export const PUT=GET;
