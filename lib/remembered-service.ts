import type {TrustedIdentity} from './identity.ts';
import {json,readSessionReport,hashSecret,constantEqual,sameOriginRequest,readJsonBody} from './session-service.ts';
import {toCardObservation,storedSelfType,type Report} from './assessment.ts';
import {deriveUsageLevel} from './usage-level.ts';
import {PROTOCOL_VERSION} from './contract.ts';
export const RESULT_TTL_MS=7*86400000;
const COOKIE='agent_mbti_result';
type Stored={id:string;token_hash:string;owner_hash:string|null;expires_at:number;report:string;report_access:'email'|'card_only';self_type:string|null};
const cookieOptions=(request:Request,age:number)=>`; Path=/api/remembered; Max-Age=${age}; HttpOnly; SameSite=Strict${new URL(request.url).protocol==='https:'?'; Secure':''}`;
function response(request:Request,data:unknown,status=200,cookie?:string,age=RESULT_TTL_MS/1000){const r=json(data,status);if(cookie!==undefined)r.headers.set('Set-Cookie',COOKIE+'='+cookie+cookieOptions(request,age));return r;}
async function stored(db:D1Database,request:Request,now:number,identity:TrustedIdentity){
 const token=request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!token||!/^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(token))return null;
 const [id,secret]=token.split('.');const row=await db.prepare('SELECT * FROM remembered_results WHERE id=?1').bind(id).first<Stored>();
 if(!row||!constantEqual(row.token_hash,await hashSecret(secret)))return null;
 if(!row.owner_hash||!constantEqual(row.owner_hash,await hashSecret(identity.userId)))return null;
 if(row.expires_at<=now){await db.prepare('DELETE FROM remembered_results WHERE id=?1').bind(id).run();return null;}return row;
}
export async function handleRemembered(db:D1Database,request:Request,now=Date.now(),identity:TrustedIdentity|null=null){
 if(!identity)return json({error:"請先使用 ChatGPT 登入。"},401);
 try{
  sameOriginRequest(request,request.method!=='GET');
  await db.prepare('DELETE FROM remembered_results WHERE expires_at<=?1').bind(now).run();
  const previous=await stored(db,request,now,identity);
  if(request.method==='GET'){
   const parsed=previous?JSON.parse(previous.report) as Report:null;
   if(!previous||parsed?.version!==PROTOCOL_VERSION)return response(request,{found:false},200,'',0);
   const report={...parsed,usageLevel:deriveUsageLevel(parsed)};
   return response(request,{found:true,id:previous.id,expiresAt:previous.expires_at,card:toCardObservation(report,storedSelfType(previous.self_type)),report:previous.report_access==='email'?report:null,reportAccess:previous.report_access,delivery:previous.report_access==='email'?'not_configured':'not_requested'});
  }
  if(request.method==='DELETE'){
   if(previous)await db.batch([db.prepare('DELETE FROM remembered_results WHERE id=?1').bind(previous.id),db.prepare('DELETE FROM sessions WHERE id=?1 AND owner_hash=?2').bind(previous.id,previous.owner_hash)]);return response(request,{deleted:true},200,'',0);
  }
  if(request.method==='POST'){
   if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length'))>512)return response(request,{error:'Invalid request'},400);
   const input=await readJsonBody(request);if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(input).length>512)return response(request,{error:'Invalid request'},400);if(Object.keys(input).sort().join(',')!=='readToken,sessionId'||typeof input.sessionId!=='string'||typeof input.readToken!=='string')return response(request,{error:'Invalid request'},400);
   const authorized=await readSessionReport(db,request,input.sessionId,input.readToken,now,identity);if(!authorized?.report)return response(request,{error:'Result unavailable'},404);
   if(previous&&previous.id===input.sessionId)return response(request,{saved:true,expiresAt:previous.expires_at});
   const secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');const expiresAt=now+RESULT_TTL_MS;
   const saved=await db.prepare('INSERT INTO remembered_results (id,token_hash,owner_hash,expires_at,report,report_access,self_type) SELECT ?1,?2,?3,?4,?5,?6,self_type FROM sessions WHERE id=?1 AND owner_hash=?3 AND report IS NOT NULL AND expires_at>?7 ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,owner_hash=excluded.owner_hash,expires_at=excluded.expires_at,report=excluded.report,report_access=excluded.report_access,self_type=excluded.self_type').bind(input.sessionId,await hashSecret(secret),authorized.owner_hash,expiresAt,authorized.report,authorized.email?'email':'card_only',now).run();
   if(saved.meta.changes!==1)return response(request,{error:'Result unavailable'},410);
   if(previous)await db.prepare('DELETE FROM remembered_results WHERE id=?1').bind(previous.id).run();
   return response(request,{saved:true,expiresAt},201,input.sessionId+'.'+secret);
  }
  return response(request,{error:'Method not allowed'},405);
 }catch{return response(request,{error:'Result unavailable'},400);}
}
