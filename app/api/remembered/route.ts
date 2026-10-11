import {env} from 'cloudflare:workers';
import {handleRemembered} from '../../../lib/remembered-service.ts';
export async function GET(request:Request){return handleRemembered(env.DB,request);}
export const POST=GET;
export const DELETE=GET;
