"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Copy, Download, X } from "lucide-react";
import { HoloCard } from "./holo-card.tsx";
import { usePersonaSession } from "./use-persona-session.ts";
import { collectorInstructions } from "../lib/collector-instructions.ts";
import { makeFixture, demoReport } from "../lib/fixture.ts";
import { toCardObservation, type Report } from "../lib/assessment.ts";
import { families, personas, personaFor, levelLabels, modelLabels, clientLabels, axisLabels, artCredit, type ArtStyle, type Family } from "../lib/catalog.ts";
import { downloadCard } from "../lib/export-card.ts";

type Stage = "cover" | "identity" | "instructions" | "fixture" | "waiting" | "reveal" | "summary" | "collection";
const UI_KEY="ai-persona-view-v2";
const count=(value:number | null)=>value===null ? "未知" : value.toLocaleString();
const gaps:Record<string,string>={web_history_unavailable:"未涵蓋網頁版對話",partial_window:"觀察期間不完整",no_artifact_inspection:"未檢視實作成果",no_tokscale:"沒有 Tokscale 彙總",unattributed_runs:"部分執行無法歸屬",insufficient_records:"紀錄不足",other_sources_missing:"其他工具尚未涵蓋"};

function ReportSummary({report}:{report:Report}){
  const persona=personaFor(report.assessment.type);
  return <>
    <p className="eyebrow">{report.kind==="fixture" ? "示範資料 · 非個人評估" : "這個期間的你"}</p>
    <h1 tabIndex={-1}>你的風格，<br/>{persona.name}。</h1>
    <p className="lead">{persona.line}</p>
    <div className="result-signature"><strong>{report.assessment.type}</strong><span>{report.assessment.level==="unknown" ? "尚無法定級" : `${report.assessment.level} · ${levelLabels[report.assessment.level]}`}</span></div>
    <div className="axis-line" aria-label="四種使用習慣">{Object.values(report.axes).map((axis,i)=><div key={i}><b>{axis.value}</b><span>{axisLabels[axis.value]}</span></div>)}</div>
    <details className="report-details"><summary>打開完整觀察報告</summary><div className="report-content">
      <p className="report-period">{report.observedPeriod.from} — {report.observedPeriod.to}</p>
      <h2>這次看到了多少？</h2><p>證據覆蓋：{report.coverage.scope==="adequate" ? "涵蓋授權範圍" : report.coverage.scope==="partial" ? "部分資料" : "資料不足"}。抽樣 {count(report.coverage.sampledSessions)} 個會話；來源：{report.coverage.sources.map(s=>clientLabels[s]).join("、") || "尚未取得"}。</p>
      <dl className="metrics-list">{[["本人會話",count(report.metrics.humanSessions)],["自動化 / 子代理",`${count(report.metrics.automatedSessions)} / ${count(report.metrics.subagentSessions)}`],["本人訊息",count(report.metrics.userMessages)],["輸入 / 輸出 tokens",`${count(report.metrics.inputTokens)} / ${count(report.metrics.outputTokens)}`],["最常用模型家族",modelLabels[report.metrics.mostUsedModelFamily]],["最常用客戶端",clientLabels[report.metrics.mostUsedClient]]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <h2>有依據，才留下判斷。</h2><p>{Object.values(report.axes).map((axis,i)=>`${["交辦","查核","沉澱","動手"][i]}：${axis.value==="?" ? "保留未知" : `${axisLabels[axis.value]}（${axis.cases.join("、")}）`}`).join("；")}。</p>
      <p>{report.assessment.level==="unknown" ? "目前資料不足以定級。" : `目前證據可確認至 ${report.assessment.level}，不代表能力上限。`} LV4 需要已測試並再次使用的資產；LV5 另需持續的多個獨立流程、例外處理與維護回寫。Token 多寡不提高等級。</p>
      <h2>還沒看到的部分</h2><p>{report.coverage.gaps.map(g=>gaps[g]).join("、") || "沒有回報額外缺口；不代表已讀取所有紀錄。"}。這份觀察依據 Agent 的摘要，網站沒有檢視原始紀錄。</p>
      <p className="fineprint">風格不是分數，也不是心理測驗。QAOC 與 PVSE 沒有高低；未觀察到不等於不會。</p>
    </div></details>
  </>;
}

export function PersonaApp(){
  const flow=usePersonaSession();
  const [stage,setStage]=useState<Stage>("cover");
  const [nickname,setNickname]=useState("");
  const [email,setEmail]=useState("");
  const [emailOpen,setEmailOpen]=useState(false);
  const [emailConsent,setEmailConsent]=useState(false);
  const [style,setStyle]=useState<ArtStyle>("chibi");
  const [family,setFamily]=useState<Family>("codex");
  const [nicknameOnly,setNicknameOnly]=useState(true);
  const [manual,setManual]=useState(false);
  const [notice,setNotice]=useState("");
  const [exporting,setExporting]=useState(false);
  const [demo,setDemo]=useState(false);
  const [fixtureConsent,setFixtureConsent]=useState(false);
  const [sending,setSending]=useState(false);
  const [origin,setOrigin]=useState("");
  const about=useRef<HTMLDialogElement>(null);
  const focus=useRef<HTMLElement>(null);
  const received=useRef<string | null>(null);
  const initialized=useRef(false);
  const restoreStage=useRef<Stage | null>(null);
  const fixtureKey=useRef("");
  const active=flow.session;
  const result=flow.result;
  const card=result?.card ?? toCardObservation(demoReport);
  const expired=!!active && flow.expired && !result;
  const progress=stage==="identity" ? 1 : ["instructions","fixture","waiting"].includes(stage) ? 2 : 3;
  const instructions=active ? collectorInstructions(active,origin) : "";
  const countdown=`${Math.floor(flow.remaining/60).toString().padStart(2,"0")}:${(flow.remaining%60).toString().padStart(2,"0")}`;

  useEffect(()=>{setOrigin(location.origin);},[]);
  useEffect(()=>{
    if(!flow.ready || initialized.current) return;
    initialized.current=true;
    if(active){
      setNickname(active.nickname);setStage("waiting");
      try{const saved=JSON.parse(sessionStorage.getItem(UI_KEY) ?? "null");if(saved?.id===active.id){if(["reveal","summary","collection"].includes(saved.stage))restoreStage.current=saved.stage;if(["regular","chibi"].includes(saved.style))setStyle(saved.style);if(families.some(f=>f.id===saved.family))setFamily(saved.family);setNicknameOnly(saved.nicknameOnly!==false);setDemo(saved.demo===true);}}catch{}
    }
  },[flow.ready,active]);
  useEffect(()=>{
    if(!result || !active || received.current===active.id)return;
    received.current=active.id;
    if(!restoreStage.current)setFamily(families.find(f=>f.model===result.card.modelFamily)?.id ?? "codex");
    const destination=restoreStage.current;
    setStage(destination==="summary" && !result.report ? "collection" : destination ?? "reveal");
    restoreStage.current=null;setNotice("");setManual(false);
  },[result,active]);
  useEffect(()=>{
    if(active && initialized.current){try{sessionStorage.setItem(UI_KEY,JSON.stringify({id:active.id,stage,style,family,nicknameOnly,demo}));}catch{}}
  },[active,stage,style,family,nicknameOnly,demo]);
  useEffect(()=>{
    if(!flow.ready)return;
    window.scrollTo({top:0,behavior:"instant"});
    const timer=setTimeout(()=>focus.current?.querySelector<HTMLElement>("h1")?.focus({preventScroll:true}),50);
    return ()=>clearTimeout(timer);
  },[stage,flow.ready]);

  function go(next:Stage){setNotice("");flow.setError("");setStage(next);}
  function back(){
    const previous:Record<Stage,Stage>={cover:"cover",identity:"cover",instructions:"identity",fixture:"instructions",waiting:"instructions",reveal:"cover",summary:"reveal",collection:result?.report ? "summary" : "reveal"};
    go(previous[stage]);
  }
  function start(){
    if(result)go("reveal");else if(active)go("waiting");else go("identity");
  }
  async function create(event:FormEvent){
    event.preventDefault();setNotice("");
    if(active && !flow.expired){go("instructions");return;}
    const next=await flow.create({nickname,...(email.trim() ? {email:email.trim(),emailResultOnlyConsent:emailConsent} : {})});
    if(next){fixtureKey.current=crypto.randomUUID();setNicknameOnly(true);setFixtureConsent(false);setManual(false);go("instructions");}
  }
  async function copy(){
    try{await navigator.clipboard.writeText(instructions);go("waiting");}
    catch{setManual(true);setNotice("自動複製未成功，請選取下方指令手動複製。");}
  }
  async function erase(next:Stage="cover"){
    if(await flow.erase()){
      sessionStorage.removeItem(UI_KEY);received.current=null;restoreStage.current=null;
      setFixtureConsent(false);setEmailConsent(false);setManual(false);setNotice("");setStage(next);if(next==="cover"){setDemo(false);setNickname("");setEmail("");setEmailOpen(false);}about.current?.close();return true;
    }
    return false;
  }
  async function sendFixture(){
    if(!active?.writeToken || !fixtureConsent || sending)return;
    setSending(true);setNotice("");
    try{
      fixtureKey.current ||= crypto.randomUUID();
      const response=await fetch(`/api/collect/${active.id}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${active.writeToken}`,"Idempotency-Key":fixtureKey.current},body:JSON.stringify(makeFixture(active.nickname)),redirect:"error"});
      if(!response.ok){const failure=await response.json() as {error?:string};throw new Error(failure.error ?? "範例提交失敗，請再試一次。");}
      go("waiting");flow.retry();
    }catch(e){setNotice((e as Error).message);}finally{setSending(false);}
  }
  async function exportPng(){
    if(!result)return;
    setExporting(true);setNotice("");
    try{await downloadCard(result.card,style,family,nicknameOnly);setNotice("圖片已準備下載，含角色署名與授權。");}
    catch(e){setNotice((e as Error).message);}finally{setExporting(false);}
  }

  return <div className="app-root" data-ready={flow.ready} data-stage={stage} inert={!flow.ready}>
    <header className="journey-header">
      {stage!=="cover" && <button className="back-button" aria-label="返回上一步" disabled={flow.busy || sending} onClick={back}><ArrowLeft size={22}/></button>}
      <div className="brand"><span aria-hidden="true">✧</span>AI 人物誌<span aria-hidden="true">✧</span></div>
      {demo && stage!=="cover" && <span className="demo-badge">示範</span>}
    </header>
    {stage!=="cover" && <div className="journey-progress" aria-label={`第 ${progress} 個階段，共 3 個階段`}><div><i style={{width:`${progress/3*100}%`}}/></div><span>{progress} / 3</span></div>}
    <main ref={focus} className={`journey journey-${stage}`}>
      {stage==="cover" && <section className="cover-screen screen" aria-labelledby="cover-title">
        <h1 id="cover-title" tabIndex={-1}>你與 AI，<br/>是哪一種搭檔？</h1>
        <div className="cover-art"><HoloCard report={toCardObservation(demoReport)} style="chibi" family="codex" nicknameOnly teaser/></div>
        <button className="primary" onClick={start}>{active ? "繼續這次觀察" : "開始觀察"}<ArrowRight size={22}/></button>
      </section>}
      {stage!=="cover" && expired ? <section className="screen recovery-screen"><div className="sealed-card" aria-hidden="true"><span>✧</span></div><h1 tabIndex={-1}>這道光，<br/>暫時收起了。</h1><p className="lead">連結已到期或失效。你的暱稱還在，<br/>建立新連結後，把新指令交給 Agent。</p><button className="primary" disabled={flow.busy} onClick={()=>erase("identity")}>重新建立連結<ArrowRight size={20}/></button></section> : <>
      {stage==="identity" && <section className="identity-screen screen">
        <img className="identity-art" src="/art/codex-pvse-chibi.png" alt=""/>
        <h1 tabIndex={-1}>{active ? <>你的連結，<br/>還在等你。</> : <>這張卡，<br/>要怎麼稱呼你？</>}</h1>
        <form onSubmit={create} className="identity-form">
          <label className="sr-only" htmlFor="nickname">卡片暱稱</label><input id="nickname" className="nickname-input" autoComplete="nickname" placeholder="你的暱稱" value={active?.nickname ?? nickname} onChange={e=>setNickname(e.target.value)} required maxLength={24} readOnly={!!active}/>
          <p className="field-caption">{active ? "返回不會建立第二個連結" : "這個名字會出現在卡片上"}</p>
          {!active && <details className="email-disclosure" open={emailOpen} onToggle={e=>setEmailOpen(e.currentTarget.open)}><summary>想收到完整報告？加入 Email<span aria-hidden="true">＋</span></summary><div className="email-fields"><p>不填 Email 只取得卡片。Email 僅用於這次結果。</p><label className="sr-only" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" placeholder="你的 Email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254}/><label className="check-field"><input type="checkbox" checked={emailConsent} onChange={e=>setEmailConsent(e.target.checked)}/>我同意 Email 僅用於這次報告寄送，不用於行銷。</label><p className="local-delivery-note">本機預覽可查看完整報告；寄送尚未開放，不會寄信。</p></div></details>}
          <button className="primary wide" disabled={flow.busy || (!!email.trim() && !emailConsent)}>{flow.busy ? "建立中…" : active ? "繼續這個連結" : "建立我的連結"}<ArrowRight size={20}/></button>
          {!active && !emailOpen && <p className="small-note">不填 Email，也能拿到角色卡。</p>}
        </form>
      </section>}
      {stage==="instructions" && active && <section className="instructions-screen screen">
        <div className="sealed-card small" aria-hidden="true"><span>✧</span></div>
        <h1 tabIndex={-1}>{demo ? <>先看看，<br/>範例會送出什麼。</> : <>把這段指令，<br/>交給你的 Agent。</>}</h1>
        <p className="lead">{demo ? "使用虛構資料，走過同一個收件流程。" : <>它會先詢問可用紀錄，再讓你確認摘要。<br/>只有你核准的摘要會回到這裡。</>}</p>
        {active.writeToken ? <>
          <button className="primary" onClick={demo ? ()=>go("fixture") : copy}>{demo ? "預覽範例摘要" : "複製專屬指令"}{demo ? <ArrowRight size={20}/> : <Copy size={19}/>}</button>
          {!demo && <details className="instruction-disclosure" open={manual} onToggle={e=>setManual(e.currentTarget.open)}><summary>查看／手動複製指令</summary><textarea className="instruction-box" aria-label="貼給 Agent 的指令" value={instructions} readOnly onFocus={e=>e.currentTarget.select()}/><button className="quiet-button" onClick={()=>go("waiting")}>我已複製，開始等待<ArrowRight size={16}/></button></details>}
        </> : <><p className="small-note">重整後不保留提交權杖。已複製的指令仍可使用。</p><button className="primary" onClick={()=>go("waiting")}>繼續等待<ArrowRight size={20}/></button><button className="quiet-button" disabled={flow.busy} onClick={()=>erase("identity")}>沒複製到？建立新連結</button></>}
        <p className="small-note">連結剩餘 {countdown} · 目前僅限同一台電腦使用</p>
      </section>}
      {stage==="fixture" && active && <section className="fixture-screen screen">
        <p className="eyebrow">虛構資料 · 沒有讀取你的紀錄</p><h1 tabIndex={-1}>看過，<br/>再決定送出。</h1><p className="lead">這是範例 JSON，不會成為你的個人評估。</p>
        <pre className="fixture-json">{JSON.stringify({...makeFixture(active.nickname),consent:{localAnalysisApproved:true,aggregateUploadApproved:fixtureConsent}},null,2)}</pre>
        <label className="check-field"><input type="checkbox" checked={fixtureConsent} onChange={e=>setFixtureConsent(e.target.checked)}/>我已預覽，允許提交這份虛構摘要。</label>
        <button className="primary" disabled={!fixtureConsent || sending} onClick={sendFixture}>{sending ? "送出中…" : "確認送出範例"}<ArrowRight size={20}/></button>
      </section>}
      {stage==="waiting" && <section className="waiting-screen screen">
        <div className="sealed-card" aria-hidden="true"><span>✧</span></div>
        <h1 tabIndex={-1}>等待你的 Agent，<br/>帶回你的形態。</h1><p className="lead">確認摘要後，這裡會自動揭曉。</p>
        <div className={`waiting-status ${flow.connection}`} role="status"><i/>{flow.connection==="retrying" ? "暫時連不上，正在重試" : flow.connection==="checking" ? "正在確認收件狀態" : "尚未收到摘要"}</div>
        <p className="countdown">連結剩餘 {countdown}</p>
        {flow.connection==="retrying" ? <button className="quiet-button" onClick={flow.retry}>立即重試</button> : <button className="quiet-button" onClick={()=>go("instructions")}>重看指令</button>}
        <details className="waiting-help"><summary>還沒收到？</summary><p>把指令貼到同一台電腦上的 Agent，完成兩次授權。網站只知道摘要是否送達，無法判斷 Agent 的分析進度。</p>{flow.lastChecked && <p>上次確認：{new Date(flow.lastChecked).toLocaleTimeString("zh-TW",{hour12:false})}</p>}<button className="quiet-button" disabled={flow.busy} onClick={()=>erase("identity")}>結束這次，建立新連結</button></details>
      </section>}
      {stage==="reveal" && result && <section className="reveal-screen screen">
        <p className="eyebrow">{card.kind==="fixture" ? "示範資料 · 非個人評估" : "這個期間的你"}</p><h1 tabIndex={-1}>{card.nickname}，<br/>你的形態揭曉了。</h1>
        <div className="reveal-art"><HoloCard report={card} style={style} family={family}/></div>
        <button className="primary" onClick={()=>go(result.report ? "summary" : "collection")}>{result.report ? "看看我的觀察" : "收藏我的卡片"}<ArrowRight size={20}/></button>
        <p className="small-note">{result.report ? "風格不是分數，也不是能力上限。" : "這次沒有填 Email，提供角色卡。"}</p>
      </section>}
      {stage==="summary" && result?.report && <section className="summary-screen screen"><ReportSummary report={result.report}/><p className="delivery-state">Email 寄送尚未開放；完整報告可在這裡查看。<br/>關閉分頁或連結到期後，無法重新取得。</p><button className="primary" onClick={()=>go("collection")}>收藏我的卡片<ArrowRight size={20}/></button></section>}
      {stage==="collection" && result && <section className="collection-screen screen"><h1 tabIndex={-1}>把這道光，<br/>留給自己。</h1><div className="collection-art"><HoloCard report={card} style={style} family={family} nicknameOnly={nicknameOnly}/></div>
        <div className="style-switch" aria-label="卡片畫風"><button aria-pressed={style==="regular"} onClick={()=>setStyle("regular")}>一般</button><button aria-pressed={style==="chibi"} onClick={()=>setStyle("chibi")}>Q 版</button></div>
        <p className="drag-hint"><span className="motion-hint">拖曳卡片，看看另一道光</span><span className="reduced-hint">已依偏好使用靜態卡面</span></p>
        <details className="card-options"><summary>卡片選項</summary><div><label htmlFor="card-family">卡面主題</label><select id="card-family" value={family} onChange={e=>setFamily(e.target.value as Family)}>{families.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select><label className="check-field"><input type="checkbox" checked={nicknameOnly} onChange={e=>setNicknameOnly(e.target.checked)}/>只顯示暱稱，隱藏等級與分型</label><p>換畫風或主題不會改變觀察。<br/>{card.assessment.type!=="PVSE" ? "此分型插圖尚未製作，使用待顯影卡面。" : "目前提供六家族的 PVSE 同人插圖。"}</p></div></details>
        <button className="primary" onClick={exportPng} disabled={exporting}>{exporting ? "製作圖片中…" : "下載我的角色卡"}<Download size={20}/></button><p className="small-note">圖片不含 Email、使用紀錄或會話連結。</p>
        <p className="collection-credit">{artCredit(family)}<br/>CC BY-NC-SA 4.0 · 非官方／非商業</p>
      </section>}
      </>}
      {(flow.error || notice) && <p className="inline-notice" role="status">{flow.error || notice}</p>}
    </main>
    <footer className="journey-footer"><button onClick={()=>about.current?.showModal()}>關於這份觀察</button></footer>
    <dialog ref={about} className="about-dialog" aria-labelledby="about-title"><button className="icon-button dialog-close" onClick={()=>about.current?.close()} aria-label="關閉說明"><X size={22}/></button><h2 id="about-title">把理解自己，<br/>留給真實的習慣。</h2><p>這是一段以授權使用紀錄為依據的觀察，不是問卷，也不是心理測驗。網站只接收你看過並核准的最小摘要。</p>
      <details><summary>觀察依據與 16 種風格</summary><p>採用 <a href="https://github.com/Raymondhou0917/ai-level-check/tree/d262ca67a6efa59ffb0e0a2a2843978a149e047d" target="_blank" rel="noreferrer">Raymondhou0917 / ai-level-check v0.4.6</a>（MIT）。P/Q 交辦起點、V/A 查核、S/O 複用、E/C 執行方式；沒有證據就保留未知。等級依行為證據，不按 Token 排名。</p><div className="about-types">{Object.entries(personas).map(([code,p])=><div key={code}><b>{code}</b><span>{p.name}</span></div>)}</div></details>
      <details><summary>角色來源與非商業授權</summary><p>六個家族各有 PVSE 一般版與 Q 版，共 12 張；其餘 180 張尚未製作。Codex 使用 GPT 娘的同人改編，並非官方 Codex 角色。圖片改編參考 <a href="https://github.com/Apprentice-Geo/AI-Fanworks/tree/main/ApprenTice/images" target="_blank" rel="noreferrer">ApprenTice</a>；角色原作參考 ZipZipPipe，DeepSeek 另含上善無形。</p><p>AI 輔助再創作，<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>，限非商業、署名及相同方式分享。上游權利鏈尚未全面核實，沒有模型業者背書。</p><a href="/art-provenance.md" target="_blank" rel="noreferrer">完整素材來源 ↗</a></details>
      <details><summary>資料與 Email 如何使用</summary><p>暱稱與核准摘要只供這次結果。Email 選填：不填只提供卡片，填寫並同意結果用途才可取得完整報告；不行銷，不出現在卡片上。本機預覽尚未連接寄信服務，沒有寄出 Email。</p><p>連結 30 分鐘後禁止讀寫；到期資料於後續請求清理，也可提前結束並刪除。讀取與提交權限分開，沒有公開結果網址。重整不保存提交權杖。</p><p>私人 Sites 外部 callback 尚未驗證。目前只在本機運作，不繞過存取閘門，也不分享整站通行權杖。</p></details>
      {!active && <button className="quiet-button demo-entry" onClick={()=>{setDemo(true);setNickname("示範旅人");about.current?.close();go("identity");}}>使用虛構資料體驗<ArrowRight size={16}/></button>}
      {active && <button className="quiet-button danger-action" disabled={flow.busy} onClick={()=>erase()}>結束觀察並刪除資料</button>}
      {flow.error && <p role="alert">{flow.error}</p>}
    </dialog>
  </div>;
}
