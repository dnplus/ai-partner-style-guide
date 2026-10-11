"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toReport, validateSubmission, type CardObservation, type Report } from "../lib/assessment.ts";
import {usageLevelSchema} from "../lib/usage-level.ts";
import { nicknameSchema, assessmentSchema, selfTypeSchema, PROTOCOL_VERSION, type TypeCode } from "../lib/contract.ts";
import type { LocalSession } from "../lib/collector-instructions.ts";
import { receivedProgressSchema, emptyProgress, type ReceivedProgress } from "../lib/collector-progress.ts";

export const SESSION_KEY = "agent-mbti-session-v2";
const sessionSchema = z.object({ id:z.string().uuid(), readToken:z.string().regex(/^[0-9a-f]{64}$/), writeToken:z.string().regex(/^[0-9a-f]{64}$/).optional(), expiresAt:z.number(), nickname:nicknameSchema });
const cardSchema = z.object({ nickname:nicknameSchema, kind:z.enum(["fixture","observed"]), assessment:assessmentSchema, usageLevel:usageLevelSchema,brief:z.array(z.string()).max(3),modelFamily:z.enum(["openai","anthropic","google","xai","deepseek","zai","other","unknown"]),selfType:selfTypeSchema.shape.selfType }).strict();
const resultSchema = z.object({ id:z.string().uuid(), expiresAt:z.number(), status:z.enum(["pending","complete"]), card:cardSchema.nullable(), report:z.record(z.unknown()).nullable(), progress:receivedProgressSchema });
export type SessionResult = { id:string; expiresAt:number; card:CardObservation; report:Report | null };

export function usePersonaSession() {
  const [ready,setReady] = useState(false);
  const [session,setSession] = useState<LocalSession | null>(null);
  const [result,setResult] = useState<SessionResult | null>(null);
  const [lastResult,setLastResult] = useState<SessionResult|null>(null);
  const [rememberError,setRememberError] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [connection,setConnection] = useState<"checking" | "connected" | "retrying">("checking");
  const [expired,setExpired] = useState(false);
  const [remaining,setRemaining] = useState(1800);
  const [lastChecked,setLastChecked] = useState<number | null>(null);
  const [agentProgress,setAgentProgress] = useState<ReceivedProgress>(emptyProgress);
  const [clock,setClock] = useState(Date.now());
  const [retry,setRetry] = useState(0);
  const generation = useRef(0);
  const working = useRef(false);
  const remembering = useRef<Promise<void>|null>(null);

  function parseResult(data:{id:string;expiresAt:number;card:CardObservation;report:Record<string,unknown>|null}):SessionResult{
    let report:Report|null=null;
    if(data.report){const {rubric,assessment,caveat,usageLevel,...submission}=data.report;void rubric;void assessment;void caveat;void usageLevel;report=toReport(validateSubmission(submission));}
    return {id:data.id,expiresAt:data.expiresAt,card:data.card,report};
  }
  useEffect(()=>{
    let mounted=true;
    async function restore(){
      try{
        const saved=sessionSchema.safeParse(JSON.parse(sessionStorage.getItem(SESSION_KEY)??"null"));
        if(saved.success){setSession(saved.data);setExpired(saved.data.expiresAt<=Date.now());}else sessionStorage.removeItem(SESSION_KEY);
      }catch{sessionStorage.removeItem(SESSION_KEY);}
      try{
        const r=await fetch("/api/remembered",{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(5000)});
        const data=await r.json() as {found?:boolean};
        if(r.ok&&data.found&&mounted){const valid=z.object({id:z.string().uuid(),expiresAt:z.number(),card:cardSchema,report:z.record(z.unknown()).nullable()}).parse(data);if(valid.expiresAt>Date.now())setLastResult(parseResult(valid));}
      }catch{}
      if(mounted)setReady(true);
    }
    void restore();return ()=>{mounted=false;};
  },[]);

  useEffect(()=>{
    if(!session) return;
    function tick(){const time=Date.now();setClock(time);const left=Math.max(0,Math.ceil((session!.expiresAt-time)/1000));setRemaining(left);if(!left)setExpired(true);}
    tick();const timer=setInterval(tick,1000);return ()=>clearInterval(timer);
  },[session]);

  useEffect(()=>{
    if(!session || expired || result) return;
    let stopped=false;
    let timer:ReturnType<typeof setTimeout>;
    let controller:AbortController | null=null;
    let failures=0;
    async function poll(){
      if(stopped) return;
      controller=new AbortController();
      const timeout=setTimeout(()=>controller?.abort(),8000);
      try {
        const response=await fetch(`/api/sessions/${session!.id}`,{headers:{Authorization:`Bearer ${session!.readToken}`},signal:controller.signal,cache:"no-store",redirect:"error"});
        if(stopped) return;
        if([404,410].includes(response.status)){setExpired(true);setError("");return;}
        if(!response.ok) throw new Error("暫時連不上，會自動重試。");
        const data=resultSchema.parse(await response.json());
        if(stopped) return;
        if(data.id!==session!.id || data.expiresAt!==session!.expiresAt) throw new Error("會話不一致。");
        setLastChecked(Date.now());setAgentProgress(data.progress);setConnection("connected");failures=0;
        if(data.status==="complete" && data.card){
          const complete=parseResult({...data,card:data.card});setResult(complete);
          const current=generation.current;
          remembering.current=fetch("/api/remembered",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:session!.id,readToken:session!.readToken}),redirect:"error",signal:AbortSignal.timeout(8000)}).then(async r=>{if(!r.ok)throw new Error();const saved=z.object({saved:z.literal(true),expiresAt:z.number()}).parse(await r.json());if(current===generation.current){setLastResult({...complete,expiresAt:saved.expiresAt});setRememberError(false);}}).catch(()=>{if(current===generation.current)setRememberError(true);});
          return;
        }
      } catch { if(!stopped){setConnection("retrying");failures++;} }
      finally { clearTimeout(timeout); }
      if(!stopped) timer=setTimeout(poll,Math.min(10000,2500*Math.max(1,failures)));
    }
    setConnection("checking");void poll();
    return ()=>{stopped=true;controller?.abort();clearTimeout(timer);};
  },[session,expired,result,retry]);

  async function create(profile:{nickname:string}) {
    if(working.current) return null;
    working.current=true;setBusy(true);setError("");
    const current=++generation.current;
    try {
      if(session && !expired) throw new Error("你已有一個連結，請先繼續或結束這次觀察。");
      const response=await fetch("/api/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...profile,protocolVersion:PROTOCOL_VERSION}),redirect:"error"});
      const value=await response.json() as {error?:unknown};
      if(!response.ok) throw new Error(typeof value.error==="string" ? value.error : "建立失敗，請再試一次。");
      const next=sessionSchema.parse(value);
      if(current!==generation.current) return null;
      const {writeToken,...saved}=next;void writeToken;
      try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(saved));}catch{}
      setSession(next);setResult(null);setExpired(false);setRemaining(1800);setLastChecked(null);setAgentProgress(emptyProgress);
      return next;
    } catch(e) {setError(e instanceof Error ? e.message : "建立失敗，請再試一次。");return null;}
    finally{working.current=false;setBusy(false);}
  }

  async function saveSelfType(selfType:TypeCode|null){
    if(!session) return false;
    try{
      const response=await fetch(`/api/sessions/${session.id}`,{method:"PUT",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.readToken}`},body:JSON.stringify({selfType}),redirect:"error"});
      if(!response.ok) throw new Error();
      return true;
    }catch{setError("暫時存不了你的選擇，請再選一次。");return false;}
  }

  async function erase(preserveRemembered=false){
    if(working.current) return false;
    working.current=true;setBusy(true);setError("");
    try {
      await remembering.current;
      if(session){
        const response=await fetch(`/api/sessions/${session.id}${preserveRemembered?"?retainResult=1":""}`,{method:"DELETE",headers:{Authorization:`Bearer ${session.readToken}`},redirect:"error"});
        if(!response.ok && ![404,410].includes(response.status)) throw new Error("暫時無法結束，請再試一次。");
      }
      if(!preserveRemembered){const removed=await fetch("/api/remembered",{method:"DELETE",redirect:"error"});if(!removed.ok)throw new Error("暫時無法結束，請再試一次。");setLastResult(null);}
      generation.current++;sessionStorage.removeItem(SESSION_KEY);setSession(null);setResult(null);setExpired(false);setLastChecked(null);setAgentProgress(emptyProgress);return true;
    } catch(e){setError((e as Error).message);return false;}
    finally{working.current=false;setBusy(false);}
  }
  return {ready,session,result,lastResult,rememberError,openLast:()=>{if(lastResult&&lastResult.expiresAt>Date.now())setResult(lastResult);},startFresh:()=>erase(true),busy,error,setError,connection,expired,remaining,lastChecked,agentProgress,clock,create,erase,saveSelfType,retry:()=>setRetry(n=>n+1)};
}
