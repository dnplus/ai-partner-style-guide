import {z} from 'zod';
import {hashSecret,json,sameOriginRequest,readJsonBody} from './session-service.ts';
import {MARKETING_VERSION,type TrustedIdentity} from './identity.ts';
export async function saveMarketingPreference(db:D1Database,identity:TrustedIdentity,optedIn:boolean,now:number){
 await db.prepare('INSERT INTO marketing_preferences (owner_hash,opted_in,contact_email,consent_version,updated_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(owner_hash) DO UPDATE SET opted_in=excluded.opted_in,contact_email=excluded.contact_email,consent_version=excluded.consent_version,updated_at=excluded.updated_at').bind(await hashSecret(identity.userId),optedIn?1:0,optedIn?identity.email:null,MARKETING_VERSION,now).run();
}
export async function handleAccount(db:D1Database,request:Request,identity:TrustedIdentity|null,now=Date.now()){
 if(!identity)return json({authenticated:false},request.method==='GET'?200:401);
 try{
  if(request.method==='PUT'){
   sameOriginRequest(request,true);const data=z.object({marketingOptIn:z.boolean()}).strict().parse(await readJsonBody(request));await saveMarketingPreference(db,identity,data.marketingOptIn,now);return json({saved:true,marketingOptIn:data.marketingOptIn,version:MARKETING_VERSION,updatedAt:now});
  }
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const preference=await db.prepare('SELECT opted_in,consent_version,updated_at FROM marketing_preferences WHERE owner_hash=?1').bind(await hashSecret(identity.userId)).first<{opted_in:number;consent_version:string;updated_at:number}>();
  return json({authenticated:true,marketingOptIn:preference?.opted_in===1,version:preference?.consent_version??null,updatedAt:preference?.updated_at??null});
 }catch{return json({error:'Invalid account request'},400);}
}
