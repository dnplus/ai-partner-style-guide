"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toReport, validateSubmission, type CardObservation, type Report } from "../lib/assessment.ts";
import { nicknameSchema } from "../lib/contract.ts";
import type { LocalSession } from "../lib/collector-instructions.ts";

export const SESSION_KEY = "ai-persona-session-v1";
const sessionSchema = z.object({ id:z.string().uuid(), readToken:z.string().regex(/^[0-9a-f]{64}$/), writeToken:z.string().regex(/^[0-9a-f]{64}$/).optional(), expiresAt:z.number(), nickname:nicknameSchema });
const cardSchema = z.object({ nickname:nicknameSchema, kind:z.enum(["fixture","observed"]), assessment:z.object({ level:z.enum(["unknown","LV0","LV1","LV2","LV3","LV4","LV4+","LV5"]), type:z.string().regex(/^[PQ?][VA?][SO?][EC?]$/) }), modelFamily:z.enum(["openai","anthropic","google","xai","deepseek","zai","other","unknown"]) }).strict();
const resultSchema = z.object({ id:z.string().uuid(), expiresAt:z.number(), status:z.enum(["pending","complete"]), card:cardSchema.nullable(), report:z.record(z.unknown()).nullable(), reportAccess:z.enum(["email","card_only"]), delivery:z.enum(["not_configured","not_requested"]) });
export type SessionResult = { card:CardObservation; report:Report | null; reportAccess:"email" | "card_only"; delivery:"not_configured" | "not_requested" };

export function usePersonaSession() {
  const [ready,setReady] = useState(false);
  const [session,setSession] = useState<LocalSession | null>(null);
  const [result,setResult] = useState<SessionResult | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [connection,setConnection] = useState<"checking" | "connected" | "retrying">("checking");
  const [expired,setExpired] = useState(false);
  const [remaining,setRemaining] = useState(1800);
  const [lastChecked,setLastChecked] = useState<number | null>(null);
  const [retry,setRetry] = useState(0);
  const generation = useRef(0);
  const working = useRef(false);

  useEffect(()=>{
    try {
      const saved=sessionSchema.safeParse(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null"));
      if(saved.success){setSession(saved.data);setExpired(saved.data.expiresAt <= Date.now());}
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { sessionStorage.removeItem(SESSION_KEY); }
    setReady(true);
  },[]);

  useEffect(()=>{
    if(!session) return;
    function tick(){const left=Math.max(0,Math.ceil((session!.expiresAt-Date.now())/1000));setRemaining(left);if(!left)setExpired(true);}
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
        setLastChecked(Date.now());setConnection("connected");failures=0;
        if(data.status==="complete" && data.card){
          let report:Report | null=null;
          if(data.reportAccess==="email" && data.report){const {framework,caveat,...submission}=data.report;void framework;void caveat;report=toReport(validateSubmission(submission));}
          setResult({card:data.card,report,reportAccess:data.reportAccess,delivery:data.delivery});return;
        }
      } catch { if(!stopped){setConnection("retrying");failures++;} }
      finally { clearTimeout(timeout); }
      if(!stopped) timer=setTimeout(poll,Math.min(10000,2500*Math.max(1,failures)));
    }
    setConnection("checking");void poll();
    return ()=>{stopped=true;controller?.abort();clearTimeout(timer);};
  },[session,expired,result,retry]);

  async function create(profile:{nickname:string;email?:string;emailResultOnlyConsent?:boolean}) {
    if(working.current) return null;
    working.current=true;setBusy(true);setError("");
    const current=++generation.current;
    try {
      if(session && !expired) throw new Error("你已有一個連結，請先繼續或結束這次觀察。");
      const response=await fetch("/api/sessions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(profile),redirect:"error"});
      const value=await response.json() as {error?:unknown};
      if(!response.ok) throw new Error(typeof value.error==="string" ? value.error : "建立失敗，請再試一次。");
      const next=sessionSchema.parse(value);
      if(current!==generation.current) return null;
      const {writeToken,...saved}=next;void writeToken;
      try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(saved));}catch{}
      setSession(next);setResult(null);setExpired(false);setRemaining(1800);setLastChecked(null);
      return next;
    } catch(e) {setError(e instanceof Error ? e.message : "建立失敗，請再試一次。");return null;}
    finally{working.current=false;setBusy(false);}
  }

  async function erase(){
    if(working.current) return false;
    working.current=true;setBusy(true);setError("");
    try {
      if(session){
        const response=await fetch(`/api/sessions/${session.id}`,{method:"DELETE",headers:{Authorization:`Bearer ${session.readToken}`},redirect:"error"});
        if(!response.ok && ![404,410].includes(response.status)) throw new Error("暫時無法結束，請再試一次。");
      }
      generation.current++;sessionStorage.removeItem(SESSION_KEY);setSession(null);setResult(null);setExpired(false);setLastChecked(null);return true;
    } catch(e){setError((e as Error).message);return false;}
    finally{working.current=false;setBusy(false);}
  }
  return {ready,session,result,busy,error,setError,connection,expired,remaining,lastChecked,create,erase,retry:()=>setRetry(n=>n+1)};
}
