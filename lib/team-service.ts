import {z} from 'zod';
import {json,HttpError,failure,hashSecret,constantEqual,sameOriginRequest,readJsonBody,readSessionReport} from './session-service.ts';
import {nicknameSchema,PROTOCOL_VERSION} from './contract.ts';
import {deriveUsageLevel} from './usage-level.ts';
import {objectiveStats} from './objective-stats.ts';
import type {Report} from './assessment.ts';

export const TEAM_TTL_MS=180*86400000;
export const TEAM_ENTRY_CAP=500;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const JOIN_CODE=/^[0-9a-f]{32}$/;
const hex=(bytes:number)=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const bearer=(request:Request)=>request.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
const createSchema=z.object({name:nicknameSchema}).strict();
const shareSchema=z.object({sessionId:z.string().regex(UUID),readToken:z.string().regex(/^[0-9a-f]{64}$/),member:nicknameSchema}).strict();
type TeamRow={id:string;name:string;view_hash:string;join_code:string;created_at:number;expires_at:number};
type EntryRow={id:string;member:string;snapshot:string;withdraw_hash:string;created_at:number};
export type TeamRoute={team?:string;code?:string;entry?:string};

// What a member shares: the card and the collector's own counts, never task details or transcript text.
export function teamSnapshot(report:Report){
 return {nickname:report.nickname,assessment:report.assessment,usageLevel:deriveUsageLevel(report),modelFamily:report.metrics.mostUsedModelFamily,client:report.metrics.mostUsedClient,observedPeriod:report.observedPeriod,scope:report.coverage.scope,stats:objectiveStats(report)};
}
export type TeamSnapshot=ReturnType<typeof teamSnapshot>;

async function sweep(db:D1Database,now:number){
 await db.batch([db.prepare('DELETE FROM team_entries WHERE team_id IN (SELECT id FROM teams WHERE expires_at<=?1)').bind(now),db.prepare('DELETE FROM teams WHERE expires_at<=?1').bind(now)]);
}
async function ownedTeam(db:D1Database,request:Request,id:string,now:number){
 const row=UUID.test(id)?await db.prepare('SELECT * FROM teams WHERE id=?1').bind(id).first<TeamRow>():null;
 const token=bearer(request);
 if(!row||!token||row.expires_at<=now||!constantEqual(await hashSecret(token),row.view_hash))failure(404,'看板不存在或已失效。');
 return row!;
}
async function joinedTeam(db:D1Database,code:string,now:number){
 const row=JOIN_CODE.test(code)?await db.prepare('SELECT * FROM teams WHERE join_code=?1').bind(code).first<TeamRow>():null;
 if(!row||row.expires_at<=now)failure(404,'邀請連結無效或已失效。');
 return row!;
}

async function create(db:D1Database,request:Request,now:number){
 if(request.method!=='POST')failure(405,'此操作不支援。');
 const parsed=createSchema.safeParse(await readJsonBody(request));
 if(!parsed.success)return failure(400,'請檢查看板名稱。');
 await sweep(db,now);
 const id=crypto.randomUUID(),viewToken=hex(32),joinCode=hex(16),expiresAt=now+TEAM_TTL_MS;
 await db.prepare('INSERT INTO teams (id,name,view_hash,join_code,created_at,expires_at) VALUES (?1,?2,?3,?4,?5,?6)').bind(id,parsed.data.name,await hashSecret(viewToken),joinCode,now,expiresAt).run();
 return json({id,name:parsed.data.name,viewToken,joinCode,expiresAt},201);
}

async function board(db:D1Database,request:Request,route:TeamRoute,now:number){
 const team=await ownedTeam(db,request,route.team!,now);
 if(route.entry){
  if(request.method!=='DELETE')failure(405,'此操作不支援。');
  await db.prepare('DELETE FROM team_entries WHERE id=?1 AND team_id=?2').bind(route.entry,team.id).run();
  return json({deleted:true});
 }
 if(request.method==='DELETE'){
  await db.batch([db.prepare('DELETE FROM team_entries WHERE team_id=?1').bind(team.id),db.prepare('DELETE FROM teams WHERE id=?1').bind(team.id)]);
  return json({deleted:true});
 }
 if(request.method!=='GET')failure(405,'此操作不支援。');
 const {results}=await db.prepare('SELECT id,member,snapshot,created_at FROM team_entries WHERE team_id=?1 ORDER BY created_at DESC LIMIT ?2').bind(team.id,TEAM_ENTRY_CAP).all<EntryRow>();
 return json({id:team.id,name:team.name,joinCode:team.join_code,createdAt:team.created_at,expiresAt:team.expires_at,entries:results.map(row=>({id:row.id,member:row.member,createdAt:row.created_at,snapshot:JSON.parse(row.snapshot) as TeamSnapshot}))});
}

async function member(db:D1Database,request:Request,route:TeamRoute,now:number){
 const team=await joinedTeam(db,route.code!,now);
 if(route.entry){
  if(request.method!=='DELETE')failure(405,'此操作不支援。');
  const token=bearer(request);
  const row=UUID.test(route.entry)?await db.prepare('SELECT withdraw_hash FROM team_entries WHERE id=?1 AND team_id=?2').bind(route.entry,team.id).first<EntryRow>():null;
  if(!row||!token||!constantEqual(await hashSecret(token),row.withdraw_hash))failure(404,'找不到這筆分享。');
  await db.prepare('DELETE FROM team_entries WHERE id=?1').bind(route.entry).run();
  return json({deleted:true});
 }
 if(request.method==='GET')return json({name:team.name});
 if(request.method!=='POST')failure(405,'此操作不支援。');
 const parsed=shareSchema.safeParse(await readJsonBody(request));
 if(!parsed.success)return failure(400,'請檢查你在團隊中的名字。');
 const session=await readSessionReport(db,request,parsed.data.sessionId,parsed.data.readToken,now);
 const report=session.report?JSON.parse(session.report) as Report:null;
 if(!report)return failure(409,'結果還沒送達，揭曉後再分享。');
 if(report.version!==PROTOCOL_VERSION)failure(410,'觀察規則已更新，請重新觀察後再分享。');
 if(report.kind!=='observed')failure(422,'示範資料不能分享到團隊。');
 const count=await db.prepare('SELECT count(*) AS n FROM team_entries WHERE team_id=?1').bind(team.id).first<{n:number}>();
 if((count?.n??0)>=TEAM_ENTRY_CAP)failure(409,'這個看板已滿。');
 // Sharing the same result again renames it and replaces the withdraw token instead of adding a duplicate.
 const withdrawToken=hex(32);
 const saved=await db.prepare('INSERT INTO team_entries (id,team_id,session_id,member,snapshot,withdraw_hash,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(team_id,session_id) DO UPDATE SET member=excluded.member,withdraw_hash=excluded.withdraw_hash RETURNING id')
  .bind(crypto.randomUUID(),team.id,parsed.data.sessionId,parsed.data.member,JSON.stringify(teamSnapshot(report)),await hashSecret(withdrawToken),now).first<{id:string}>();
 return json({entryId:saved!.id,withdrawToken,team:team.name},201);
}

export async function handleTeam(db:D1Database,request:Request,route:TeamRoute,now=Date.now()):Promise<Response>{
 try{
  sameOriginRequest(request,request.method!=='GET');
  if(route.team)return await board(db,request,route,now);
  if(route.code)return await member(db,request,route,now);
  return await create(db,request,now);
 }catch(error){
  if(error instanceof HttpError)return json({error:error.message},error.status);
  console.warn(JSON.stringify({event:'team_unavailable',errorClass:error instanceof TypeError?'TypeError':'Error'}));
  return json({error:'暫時無法處理，請稍後再試。'},503);
 }
}
