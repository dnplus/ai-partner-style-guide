"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { ArrowRight, Check, Copy, ShieldCheck, X, Clock3 } from "lucide-react";
import { collectorInstructions, type LocalSession } from "../lib/collector-instructions.ts";
import { makeFixture } from "../lib/fixture.ts";
import { validateSubmission, toReport, type Report } from "../lib/assessment.ts";

const STORAGE_KEY = "ai-persona-session-v1";
const sessionEnvelope = z.object({ id:z.string().uuid(),readToken:z.string().regex(/^[0-9a-f]{64}$/),writeToken:z.string().regex(/^[0-9a-f]{64}$/).optional(),expiresAt:z.number(),nickname:z.string() });
const responseEnvelope = z.object({error:z.string().optional(),status:z.enum(["pending","complete"]).optional(),report:z.record(z.unknown()).nullable().optional()});
export function SessionFlow({ open, onClose, onComplete }: { open: boolean; onClose: () => void; onComplete: (report: Report, session: LocalSession) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [emailConsent, setEmailConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(1800);
  const [origin, setOrigin] = useState("");
  const [completed, setCompleted] = useState(false);
  const [fixtureConsent, setFixtureConsent] = useState(false);
  const retryKey = useRef("");
  const completeRef = useRef(onComplete); completeRef.current = onComplete;
  useEffect(() => {
    setOrigin(location.origin);
    try { const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null"); if (saved?.expiresAt > Date.now() && typeof saved.readToken === "string" && typeof saved.id === "string") setSession(saved); else sessionStorage.removeItem(STORAGE_KEY); } catch { sessionStorage.removeItem(STORAGE_KEY); }
  }, []);
  useEffect(() => { if (open && !dialog.current?.open) dialog.current?.showModal(); else if (!open && dialog.current?.open) dialog.current?.close(); }, [open]);
  useEffect(() => {
    if (!session || completed) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      if (stopped || !session) return;
      const left = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000)); setRemaining(left);
      if (!left) { setError("會話已到期。請建立新會話，舊指令無法再提交。"); sessionStorage.removeItem(STORAGE_KEY); return; }
      try {
        const response = await fetch(`/api/sessions/${session.id}`, { headers: { Authorization: `Bearer ${session.readToken}` }, signal: controller.signal });
        const result = responseEnvelope.parse(await response.json());
        if (stopped) return;
        if ([404,410].includes(response.status)) { setError(result.error ?? "會話已失效。"); sessionStorage.removeItem(STORAGE_KEY); setRemaining(0); return; }
        if (!response.ok) throw new Error(result.error);
        if (result.status === "complete" && result.report) { const {framework,caveat,...submission}=result.report;void framework;void caveat;const report=toReport(validateSubmission(submission));setCompleted(true); completeRef.current(report, session); return; }
      } catch (e) { if (stopped) return; setError(e instanceof Error ? e.message : "暫時連不上，將自動重試。"); }
      timer = setTimeout(poll, 2500);
    }
    void poll();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [session, completed]);

  async function create(event: FormEvent) {
    event.preventDefault();setBusy(true);setError("");
    try {
      const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname, ...(email.trim() ? { email: email.trim(), emailResultOnlyConsent: emailConsent } : {}) }) });
      const value = await response.json();
      if (!response.ok) throw new Error(responseEnvelope.parse(value).error ?? "無法建立會話。");
      const data = sessionEnvelope.parse(value);
      setSession(data);setCompleted(false);setRemaining(1800);setFixtureConsent(false);retryKey.current = crypto.randomUUID();
      const { writeToken: omitted, ...readSession } = data;
      void omitted;sessionStorage.setItem(STORAGE_KEY,JSON.stringify(readSession));
      setEmail("");setEmailConsent(false);
    } catch (e) { setError(e instanceof Error ? e.message : "無法建立會話。"); } finally { setBusy(false); }
  }
  async function copy() {
    if (!session) return;
    try { await navigator.clipboard.writeText(collectorInstructions(session,origin));setCopied(true);setTimeout(()=>setCopied(false),2000); } catch { setError("剪貼簿不可用，請從下方文字框手動複製。"); }
  }
  async function submitFixture() {
    if (!session?.writeToken || !fixtureConsent) return;
    setBusy(true);setError("");
    try {
      const response = await fetch(`/api/collect/${session.id}`, { method: "POST", headers: { "Content-Type":"application/json", Authorization:`Bearer ${session.writeToken}`, "Idempotency-Key":retryKey.current }, body:JSON.stringify(makeFixture(session.nickname)), redirect:"error" });
      const data = responseEnvelope.parse(await response.json());if(!response.ok)throw new Error(data.error ?? "範例提交失敗。");
    } catch(e) {setError(e instanceof Error ? e.message : "範例提交失敗。");} finally{setBusy(false);}
  }
  async function reset() {
    if (session && remaining > 0) {
      try { const r = await fetch(`/api/sessions/${session.id}`,{method:"DELETE",headers:{Authorization:`Bearer ${session.readToken}`}});if(!r.ok && ![404,410].includes(r.status))throw new Error("暫時無法刪除，請稍後重試。"); } catch(e){setError((e as Error).message);return;}
    }
    sessionStorage.removeItem(STORAGE_KEY);setSession(null);setCompleted(false);setError("");
  }
  return <dialog ref={dialog} className="session-dialog" onCancel={onClose} onClose={onClose} aria-labelledby="session-title">
    <button className="icon-button dialog-close" onClick={onClose} aria-label="關閉視窗"><X size={22}/></button>
    <div className="dialog-step"><span className={!session ? "active" : ""}>01 建立連結</span><i/><span className={session ? "active" : ""}>02 授權與回傳</span><i/><span>03 角色卡</span></div>
    {!session ? <form onSubmit={create}>
      <h2 id="session-title">先給這張卡，<br/><em>一個你的名字。</em></h2>
      <p className="dialog-intro">輸入暱稱，取得只屬於這次的回傳指令。</p>
      <label className="field">卡片暱稱 <span>必填</span><input autoComplete="nickname" name="nickname" value={nickname} onChange={(e)=>setNickname(e.target.value)} maxLength={24} required placeholder="你想在卡片上留下什麼名字？"/><small>1–24 字，可用中英文、數字、空格、連字號；請勿填入聯絡資訊。</small></label>
      <label className="field">Email <span>選填</span><input autoComplete="email" name="email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="只與這次結果暫存，不會寄信"/><small>不會顯示在卡片、網址或分享圖片上。</small></label>
      {email && <label className="check-field"><input type="checkbox" required checked={emailConsent} onChange={(e)=>setEmailConsent(e.target.checked)}/>我同意 Email 僅供本次結果關聯暫存，不用於行銷。</label>}
      <div className="privacy-note"><ShieldCheck size={22}/><p>原始紀錄留在你的電腦。Agent 必須先取得你的閱讀授權，再讓你確認將回傳的摘要。</p></div>
      <button className="primary wide" disabled={busy}>{busy ? "正在建立…" : "建立我的專屬指令"}<ArrowRight size={19}/></button>
      <p className="fineprint">會話 30 分鐘後失效。到期資料於下一次請求清理，亦可隨時刪除。</p>
    </form> : <div>
      <div className="waiting-title"><h2 id="session-title">讓你的 Agent，<br/><em>帶回使用足跡。</em></h2><span className="countdown"><Clock3 size={15}/>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,"0")}</span></div>
      <p className="dialog-intro">複製指令到這台電腦上的 Agent。它會先詢問授權，分析後再請你確認摘要。</p>
      <button className="primary wide" onClick={copy} disabled={!remaining || !session.writeToken}>{copied ? <Check size={18}/> : <Copy size={18}/>} {copied ? "已複製，貼給你的 Agent" : "複製專屬指令"}</button>
      <textarea aria-label="貼給 Agent 的指令" className="instruction-box" readOnly value={collectorInstructions(session,origin)}/>
      <div className="waiting-status" role="status"><span className="pulse-dot"/> {completed ? "已收到結果" : remaining ? "等待你確認後的摘要回傳" : "此會話已到期"}</div>
      <p className="fineprint">本機測試網址只適用同一台電腦。關閉視窗後仍可接收；重整後只保留讀取權限。</p>
      <div className="text-links"><a href="/collector-protocol.md" target="_blank" rel="noreferrer">查看回傳協定 ↗</a><button onClick={reset}>刪除此會話並重來</button></div>
      {/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin) && remaining > 0 && session.writeToken && !completed && <details className="fixture-preview"><summary>使用範例資料測試流程</summary><p>以下為虛構範例，不是你的評估，也不會讀取任何紀錄。</p><pre>{JSON.stringify(makeFixture(session.nickname),null,2)}</pre><label className="check-field"><input type="checkbox" checked={fixtureConsent} onChange={(e)=>setFixtureConsent(e.target.checked)}/>我已檢視，確認只送出這份範例摘要。</label><button className="secondary wide" onClick={submitFixture} disabled={busy || !fixtureConsent}>{busy ? "正在回傳…" : "確認並回傳範例摘要"}</button></details>}
    </div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </dialog>;
}
