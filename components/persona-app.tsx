"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Copy, Download, X } from "lucide-react";
import { HoloCard } from "./holo-card.tsx";
import { usePersonaSession } from "./use-persona-session.ts";
import { collectorInstructions } from "../lib/collector-instructions.ts";
import { makeFixture, demoReport } from "../lib/fixture.ts";
import { toCardObservation, type Report } from "../lib/assessment.ts";
import { families, personas, personaFor, modelLabels, clientLabels, artCredit, type ArtStyle, type Family } from "../lib/catalog.ts";
import { axisDefinitions, letterLabels, letterTips, behaviorLetters, contextLabels } from "../lib/workstyle.ts";
import { downloadCard } from "../lib/export-card.ts";
import { describeProgress } from "../lib/collector-progress.ts";
import { reportCollectorProgress, submitAuthorizedSummary } from "../lib/collector-runner.ts";

type Stage = "cover" | "identity" | "instructions" | "fixture" | "waiting" | "reveal" | "summary" | "collection";
const UI_KEY="agent-mbti-view-v2";
const count=(value:number | null)=>value===null ? "未知" : value.toLocaleString();
const gaps:Record<string,string>={web_history_unavailable:"未涵蓋網頁版對話",partial_window:"觀察期間不完整",no_artifact_inspection:"未檢視實作成果",no_tokscale:"沒有 Tokscale 彙總",unattributed_runs:"部分執行無法歸屬",insufficient_records:"紀錄不足",other_sources_missing:"其他工具尚未涵蓋"};

function ReportSummary({report}:{report:Report}){
  const persona=personaFor(report.assessment.type);
  return <>
    <p className="eyebrow">{report.kind==="fixture" ? "示範資料 · 非個人評估" : "你們的合作，留下了這些線索"}</p>
    <h1 tabIndex={-1}>{report.assessment.type ? <>這次，你的 Agent<br/>偏向 {report.assessment.type}。</> : <>輪廓，<br/>還在形成。</>}</h1>
    <p className="lead">{persona.line}</p>
    <div className="result-signature"><strong>{report.assessment.type ?? "未定型"}</strong><span>{persona.name}</span></div>
    <div className="axis-line" aria-label="四種合作偏好">{report.axisFindings.map((axis)=><div key={axis.axis}><b>{axis.value}</b><span>{letterLabels[axis.value]}</span></div>)}</div>
    <details className="report-details"><summary>打開完整觀察報告</summary><div className="report-content">
      <p className="report-period">{report.observedPeriod.from} — {report.observedPeriod.to}</p>
      <h2>你怎麼帶它，它怎麼做事。</h2>
      {report.axisFindings.map((axis,i)=><section className="axis-finding" key={axis.axis}>
        <h3>{axisDefinitions[i].name} · {axis.value==="?" ? axis.reason==="near_boundary" ? "證據分歧，暫不定向" : "證據還不夠" : letterLabels[axis.value]}</h3>
        <p>{axis.eligibleTasks} 個獨立有效任務：{axisDefinitions[i].left} {axis.leftTasks.length} 個、{axisDefinitions[i].right} {axis.rightTasks.length} 個、混合 {axis.mixedTasks.length} 個。{axis.excludedTasks.length ? "另有 "+axis.excludedTasks.length+" 個任務含受限、不明或不符合主人要求的觀察，這些觀察未計入。" : ""}</p>
        <p>{axis.value==="?" ? axisDefinitions[i].prompt : letterTips[axis.value]}</p>
      </section>)}
      <h2>這次看到了多少？</h2><p>證據覆蓋：{report.coverage.scope==="adequate" ? "涵蓋授權範圍" : report.coverage.scope==="partial" ? "部分資料" : "資料不足"}。抽樣 {count(report.coverage.sampledSessions)} 個會話；來源：{report.coverage.sources.map(s=>clientLabels[s]).join("、") || "尚未取得"}。</p>
      <dl className="metrics-list">{[["本人會話",count(report.metrics.humanSessions)],["自動化 / 子代理",count(report.metrics.automatedSessions)+" / "+count(report.metrics.subagentSessions)],["本人訊息",count(report.metrics.userMessages)],["輸入 / 輸出 tokens",count(report.metrics.inputTokens)+" / "+count(report.metrics.outputTokens)],["最常用模型家族",modelLabels[report.metrics.mostUsedModelFamily]],["最常用客戶端",clientLabels[report.metrics.mostUsedClient]]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <details className="evidence-details"><summary>看任務脈絡與主人要求</summary>{report.tasks.map(task=><section className="task-evidence" key={task.id}><h3>{task.id} · {contextLabels[task.context]}</h3><p>{task.date} · {clientLabels[task.source]}</p><ul>{report.observations.filter(o=>o.task===task.id).map(o=><li key={o.id}><span>主人：{o.ownerRequest==="unknown" ? "要求未能確認" : o.ownerRequest==="not_specified" ? "未指定方向" : letterLabels[behaviorLetters[o.ownerRequest]]}</span><span>實際：{letterLabels[behaviorLetters[o.behavior]]} · {o.opportunity==="both_available" ? "兩端可選" : o.opportunity==="constrained" ? "情境受限" : "可選性不明"}</span></li>)}</ul></section>)}</details>
      <h2>還沒看到的部分</h2><p>{report.coverage.gaps.map(g=>gaps[g]).join("、") || "沒有回報額外缺口；不代表已讀取所有紀錄。"}。網站只檢查 Agent 摘要的一致性，沒有檢視原始紀錄。</p>
      <p className="fineprint">{report.caveat} 每軸至少三個獨立任務；方向不明或不足時保留未知。內部門檻不是準確率或性格強度，用量與模型家族不參與分型。</p>
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
  const [resumeMode,setResumeMode]=useState(false);
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
  const instructions=active ? collectorInstructions(active,origin,resumeMode) : "";
  const agentState=describeProgress(flow.agentProgress,flow.clock);
  const countdown=`${Math.floor(flow.remaining/60).toString().padStart(2,"0")}:${(flow.remaining%60).toString().padStart(2,"0")}`;

  useEffect(()=>{setOrigin(location.origin);},[]);
  useEffect(()=>{
    if(!flow.ready || initialized.current) return;
    initialized.current=true;
    if(active){
      setNickname(active.nickname);setStage("waiting");
      try{const saved=JSON.parse(sessionStorage.getItem(UI_KEY) ?? "null");if(saved?.id===active.id){if(["reveal","summary","collection"].includes(saved.stage))restoreStage.current=saved.stage;if(["regular","chibi"].includes(saved.style))setStyle(saved.style);if(families.some(f=>f.id===saved.family))setFamily(saved.family);setNicknameOnly(saved.nicknameOnly!==false);setDemo(saved.demo===true);setResumeMode(saved.resumeMode===true);}}catch{}
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
    if(active && initialized.current){try{sessionStorage.setItem(UI_KEY,JSON.stringify({id:active.id,stage,style,family,nicknameOnly,demo,resumeMode}));}catch{}}
  },[active,stage,style,family,nicknameOnly,demo,resumeMode]);
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
      setFixtureConsent(false);setEmailConsent(false);setManual(false);setNotice("");setStage(next);if(next==="cover"){setDemo(false);setResumeMode(false);setNickname("");setEmail("");setEmailOpen(false);}about.current?.close();return true;
    }
    return false;
  }
  async function renew(){
    if(await erase("identity"))setResumeMode(true);
  }
  async function sendFixture(){
    if(!active?.writeToken || !fixtureConsent || sending)return;
    setSending(true);setNotice("");
    try{
      fixtureKey.current ||= crypto.randomUUID();
      const sample=makeFixture(active.nickname);
      const target={origin,id:active.id,writeToken:active.writeToken,expiresAt:active.expiresAt,nickname:active.nickname};
      const grant={scopeApproved:true as const,sourceOwnershipConfirmed:true as const,origin,sessionId:active.id,expiresAt:active.expiresAt,nickname:active.nickname,sources:sample.coverage.sources,period:sample.observedPeriod};
      go("waiting");
      await reportCollectorProgress(grant,target,{sequence:1,phase:"validating",approvalKind:null});
      const outcome=await submitAuthorizedSummary(sample,grant,target,fixtureKey.current);
      if(outcome.status!=="accepted")throw new Error(outcome.status==="expired" ? "這個連結已失效，請換新連結後重新授權。" : "範例尚未確認送達，請重試。");
      flow.retry();
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
      <div className="brand"><span aria-hidden="true">✧</span>你的 Agent MBTI<span aria-hidden="true">✧</span></div>
      {demo && stage!=="cover" && <span className="demo-badge">示範</span>}
    </header>
    {stage!=="cover" && <div className="journey-progress" aria-label={`第 ${progress} 個階段，共 3 個階段`}><div><i style={{width:`${progress/3*100}%`}}/></div><span>{progress} / 3</span></div>}
    <main ref={focus} className={`journey journey-${stage}`}>
      {stage==="cover" && <section className="cover-screen screen" aria-labelledby="cover-title">
        <h1 id="cover-title" tabIndex={-1}>你的 Agent，<br/>是哪一種 MBTI？</h1>
        <p className="cover-tagline">你怎麼帶它做事，<br className="mobile-break"/>它就長出怎樣的工作風格。</p><div className="cover-art"><HoloCard report={toCardObservation(demoReport)} style="chibi" family="codex" nicknameOnly teaser/></div>
        <button className="primary" onClick={start}>{active ? "繼續這次觀察" : "開始觀察"}<ArrowRight size={22}/></button>
      </section>}
      {stage!=="cover" && expired ? <section className="screen recovery-screen"><div className="sealed-card" aria-hidden="true"><span>✧</span></div><h1 tabIndex={-1}>這道光，<br/>暫時收起了。</h1><p className="lead">連結已到期或失效。請讓 Agent 保留已整理的最小摘要，<br/>換新連結後，只需明確核准新的收件目的地。</p><button className="primary" disabled={flow.busy} onClick={renew}>沿用分析，換新連結<ArrowRight size={20}/></button></section> : <>
      {stage==="identity" && <section className="identity-screen screen">
        <img className="identity-art" src="/art/codex-portrait-chibi.png" alt=""/>
        <h1 tabIndex={-1}>{active ? <>你的連結，<br/>還在等你。</> : <>這位搭檔，<br/>該怎麼稱呼？</>}</h1>{resumeMode && !active && <p className="small-note renewal-note">將建立新的收件連結。舊連結不延長；新指令會要求你明確核准新目的地，已保存的最小摘要可繼續使用。</p>}
        <form onSubmit={create} className="identity-form">
          <label className="sr-only" htmlFor="nickname">Agent 的名字</label><input id="nickname" className="nickname-input" autoComplete="off" placeholder="Agent 的名字" value={active?.nickname ?? nickname} onChange={e=>setNickname(e.target.value)} required maxLength={24} readOnly={!!active}/>
          <p className="field-caption">{active ? "返回不會建立第二個連結" : "這個名字會出現在卡片上"}</p>
          {!active && <details className="email-disclosure" open={emailOpen} onToggle={e=>setEmailOpen(e.currentTarget.open)}><summary>想收到完整報告？加入 Email<span aria-hidden="true">＋</span></summary><div className="email-fields"><p>不填 Email 只取得卡片。Email 僅用於這次結果。</p><label className="sr-only" htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" placeholder="你的 Email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254}/><label className="check-field"><input type="checkbox" checked={emailConsent} onChange={e=>setEmailConsent(e.target.checked)}/>我同意 Email 僅用於這次報告寄送，不用於行銷。</label><p className="local-delivery-note">本機預覽可查看完整報告；寄送尚未開放，不會寄信。</p></div></details>}
          <button className="primary wide" disabled={flow.busy || (!!email.trim() && !emailConsent)}>{flow.busy ? "建立中…" : active ? "繼續這個連結" : "建立我的連結"}<ArrowRight size={20}/></button>
          {!active && !emailOpen && <p className="small-note">不填 Email，也能拿到角色卡。</p>}
        </form>
      </section>}
      {stage==="instructions" && active && <section className="instructions-screen screen">
        <div className="sealed-card small" aria-hidden="true"><span>✧</span></div>
        <h1 tabIndex={-1}>{demo ? <>先選好，<br/>這次觀察的範圍。</> : <>把這段指令，<br/>交給你的 Agent。</>}</h1>
        <p className="lead">{demo ? "使用虛構資料，走過同一個收件流程。" : <>一次確認來源、期間與最小摘要傳送。<br/>同意後自動完成，回來這裡看結果。</>}</p>
        {active.writeToken ? <>
          <button className="primary" onClick={demo ? ()=>go("fixture") : copy}>{demo ? "查看示範範圍" : "複製專屬指令"}{demo ? <ArrowRight size={20}/> : <Copy size={19}/>}</button>
          {!demo && <details className="instruction-disclosure" open={manual} onToggle={e=>setManual(e.currentTarget.open)}><summary>查看／手動複製指令</summary><textarea className="instruction-box" aria-label="貼給 Agent 的指令" value={instructions} readOnly onFocus={e=>e.currentTarget.select()}/><button className="quiet-button" onClick={()=>go("waiting")}>我已複製，開始等待<ArrowRight size={16}/></button></details>}
        </> : <><p className="small-note">重整後不保留提交權杖。已複製的指令仍可使用。</p><button className="primary" onClick={()=>go("waiting")}>繼續等待<ArrowRight size={20}/></button><button className="quiet-button" disabled={flow.busy} onClick={renew}>沒複製到？換新連結</button></>}
        <p className="small-note">連結剩餘 {countdown} · 目前僅限同一台電腦使用</p>
      </section>}
      {stage==="fixture" && active && <section className="fixture-screen screen">
        <p className="eyebrow">虛構資料 · 沒有讀取你的紀錄</p><h1 tabIndex={-1}>一次同意，<br/>接著等它揭曉。</h1><p className="lead">確認這次範圍，剩下的自動完成。</p>
        <div className="scope-card"><p><b>來源與期間</b><span>網站內建的 3 個虛構任務，2026/10/01–10/09。沒有你的對話。</span></p><p><b>傳送內容</b><span>暱稱、日期、來源與缺口、用量彙總、抽象任務與行為列舉、衍生分型及階段狀態。</span></p><p><b>目的地</b><span>目前網站的這個收件連結，有效至 {new Date(active.expiresAt).toLocaleTimeString("zh-TW",{hour12:false})}。</span></p></div>
        <label className="check-field"><input type="checkbox" checked={fixtureConsent} onChange={e=>setFixtureConsent(e.target.checked)}/>我同意此範圍的虛構摘要自動驗證並傳送。</label>
        <button className="primary" disabled={!fixtureConsent || sending} onClick={sendFixture}>{sending ? "處理中…" : "同意並開始示範"}<ArrowRight size={20}/></button>
      </section>}
      {stage==="waiting" && <section className="waiting-screen screen">
        <div className="sealed-card" aria-hidden="true"><span>✧</span></div>
        <h1 tabIndex={-1}>{flow.connection==="retrying" ? <>正在重新連上，<br/>請稍等一下。</> : <>等它帶回，<br/>你們的合作線索。</>}</h1>
        <div className={"waiting-status "+flow.connection} role="status"><i/>{flow.connection==="retrying" ? "網站暫時連不上收件服務" : flow.connection==="checking" ? "正在確認收件狀態" : agentState.title}</div>
        <p className="lead waiting-explanation">{flow.connection==="retrying" ? "這不代表 Agent 中斷。網站會自動重試，請保留這個分頁。" : agentState.details}</p>
        {flow.agentProgress.updatedAt && <p className="progress-time">最後訊號：{agentState.lastPhase} · {new Date(flow.agentProgress.updatedAt).toLocaleTimeString("zh-TW",{hour12:false})}</p>}
        <p className="countdown">連結剩餘 {countdown}</p>
        {flow.connection==="retrying" ? <button className="quiet-button" onClick={flow.retry}>立即重試</button> : <button className="quiet-button" onClick={()=>go("instructions")}>重看指令</button>}
        <details className="waiting-help"><summary>還沒收到？</summary><p>只需在 Agent 確認一次來源、期間與摘要傳送範圍。若主機另外要求讀取或連線核准，請在原生提示處處理；網站不會代替核准。</p><p>超過 90 秒沒有新階段訊號時，我們會明確標示未知。若分析已完成，請 Agent 保留最小摘要；換連結後明確核准新目的地，不用重掃資料。</p>{flow.lastChecked && <p>網站上次連上收件服務：{new Date(flow.lastChecked).toLocaleTimeString("zh-TW",{hour12:false})}</p>}<button className="quiet-button" disabled={flow.busy} onClick={renew}>沿用分析，換新連結</button></details>
      </section>}
      {stage==="reveal" && result && <section className="reveal-screen screen">
        <p className="eyebrow">{card.kind==="fixture" ? "示範資料 · 非個人評估" : "你們的合作，留下了這些線索"}</p><h1 tabIndex={-1}>{card.nickname}，<br/>{card.assessment.type ? "這次偏向 "+card.assessment.type+"。" : "輪廓還在形成。"}</h1>
        <div className="reveal-art"><HoloCard report={card} style={style} family={family}/></div>
        <button className="primary" onClick={()=>go(result.report ? "summary" : "collection")}>{result.report ? "看看我的觀察" : "收藏我的卡片"}<ArrowRight size={20}/></button>
        <p className="small-note">{result.report ? "合作風格，會跟著你們的任務改變。" : "這次沒有填 Email，提供角色卡。"}</p>
      </section>}
      {stage==="summary" && result?.report && <section className="summary-screen screen"><ReportSummary report={result.report}/><p className="delivery-state">Email 寄送尚未開放；完整報告可在這裡查看。<br/>關閉分頁或連結到期後，無法重新取得。</p><button className="primary" onClick={()=>go("collection")}>收藏我的卡片<ArrowRight size={20}/></button></section>}
      {stage==="collection" && result && <section className="collection-screen screen"><h1 tabIndex={-1}>把這道光，<br/>留給自己。</h1><div className="collection-art"><HoloCard report={card} style={style} family={family} nicknameOnly={nicknameOnly}/></div>
        <div className="style-switch" aria-label="卡片畫風"><button aria-pressed={style==="regular"} onClick={()=>setStyle("regular")}>一般</button><button aria-pressed={style==="chibi"} onClick={()=>setStyle("chibi")}>Q 版</button></div>
        <p className="drag-hint"><span className="motion-hint">拖曳卡片，看看另一道光</span><span className="reduced-hint">已依偏好使用靜態卡面</span></p>
        <details className="card-options"><summary>卡片選項</summary><div><label htmlFor="card-family">卡面主題</label><select id="card-family" value={family} onChange={e=>setFamily(e.target.value as Family)}>{families.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select><label className="check-field"><input type="checkbox" checked={nicknameOnly} onChange={e=>setNicknameOnly(e.target.checked)}/>只顯示暱稱，隱藏分型</label><p>造型不決定分型。<br/>六個家族各有一般／Q 版，可自由搭配。</p></div></details>
        <button className="primary" onClick={exportPng} disabled={exporting}>{exporting ? "製作圖片中…" : "下載我的角色卡"}<Download size={20}/></button><p className="small-note">圖片不含 Email、使用紀錄或會話連結。</p>
        <p className="collection-credit">{artCredit(family)}<br/>CC BY-NC-SA 4.0 · 非官方／非商業</p>
      </section>}
      </>}
      {(flow.error || notice) && <p className="inline-notice" role="status">{flow.error || notice}</p>}
    </main>
    <footer className="journey-footer"><button onClick={()=>about.current?.showModal()}>關於這份觀察</button></footer>
    <dialog ref={about} className="about-dialog" aria-labelledby="about-title"><button className="icon-button dialog-close" onClick={()=>about.current?.close()} aria-label="關閉說明"><X size={22}/></button><h2 id="about-title">你怎麼帶它，<br/>它就怎麼做事。</h2><p>這是一段以授權使用紀錄為依據的合作觀察。借用四組字母，以自訂規則描述合作風格，非官方 MBTI 評量。網站只接收你事前明確授權範圍內的最小摘要，授權後自動驗證與傳送。</p>
      <details><summary>觀察依據與 16 種風格</summary><p>借用 E/I 互動節奏、S/N 理解起點、T/F 取捨依據、J/P 推進方式，以原創規則觀察主人帶領 Agent 的實際合作。這不是人的人格診斷，也不是模型的固定性格。</p><p>每軸至少三個獨立任務；同一任務只算一次。受限情境不計入，接近或不足就保留未知。舊結果需要重新分析。<a href="/collector-protocol.md" target="_blank" rel="noreferrer">完整觀察方式 ↗</a></p><div className="about-types">{Object.entries(personas).map(([code,p])=><div key={code}><b>{code}</b><span>{p.name}</span></div>)}</div></details>
      <details><summary>角色來源與非商業授權</summary><p>六個家族各有一般版與 Q 版，共 12 張通用造型。造型與分型無關，沒有宣稱每型都有專屬插圖。Codex 使用 GPT 娘的同人改編，並非官方 Codex 角色。圖片改編參考 <a href="https://github.com/Apprentice-Geo/AI-Fanworks/tree/main/ApprenTice/images" target="_blank" rel="noreferrer">ApprenTice</a>；角色原作參考 ZipZipPipe，DeepSeek 另含上善無形。</p><p>AI 輔助再創作，<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>，限非商業、署名及相同方式分享。上游權利鏈尚未全面核實，沒有模型業者背書。</p><a href="/art-provenance.md" target="_blank" rel="noreferrer">完整素材來源 ↗</a></details>
      <details><summary>資料與 Email 如何使用</summary><p>暱稱與核准摘要只供這次結果。Email 選填：不填只提供卡片，填寫並同意結果用途才可取得完整報告；不行銷，不出現在卡片上。本機預覽尚未連接寄信服務，沒有寄出 Email。</p><p>連結 30 分鐘後禁止讀寫；到期資料於後續請求清理，也可提前結束並刪除。讀取與提交權限分開，沒有公開結果網址。重整不保存提交權杖。</p><p>私人 Sites 外部 callback 尚未驗證。目前只在本機運作，不繞過存取閘門，也不分享整站通行權杖。</p></details>
      {!active && <button className="quiet-button demo-entry" onClick={()=>{setDemo(true);setNickname("示範搭檔");about.current?.close();go("identity");}}>使用虛構資料體驗<ArrowRight size={16}/></button>}
      {active && <button className="quiet-button danger-action" disabled={flow.busy} onClick={()=>erase()}>結束觀察並刪除資料</button>}
      {flow.error && <p role="alert">{flow.error}</p>}
    </dialog>
  </div>;
}
