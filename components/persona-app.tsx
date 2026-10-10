"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Hand, ShieldCheck, X, Trash2, RotateCcw, ArrowUpRight } from "lucide-react";
import { HoloCard } from "./holo-card.tsx";
import { SessionFlow } from "./session-flow.tsx";
import { demoReport } from "../lib/fixture.ts";
import { families, personas, personaFor, levelLabels, modelLabels, clientLabels, axisLabels, type ArtStyle, type Family, type PersonaCode } from "../lib/catalog.ts";
import { downloadCard } from "../lib/export-card.ts";
import type { Report } from "../lib/assessment.ts";
import type { LocalSession } from "../lib/collector-instructions.ts";

const gaps: Record<string,string> = { web_history_unavailable:"未涵蓋網頁版對話",partial_window:"觀察期間不完整",no_artifact_inspection:"未檢視實作成果",no_tokscale:"沒有 Tokscale 彙總",unattributed_runs:"部分執行無法歸屬",insufficient_records:"紀錄不足",other_sources_missing:"其他工具尚未涵蓋" };
const displayCount = (n: number | null) => n === null ? "未知" : n.toLocaleString();
export function PersonaApp() {
  const [ready,setReady] = useState(false);
  useEffect(()=>setReady(true),[]);
  const [report,setReport] = useState<Report | null>(null);
  const [session,setSession] = useState<LocalSession | null>(null);
  const [style,setStyle] = useState<ArtStyle>("regular");
  const [family,setFamily] = useState<Family>("codex");
  const [open,setOpen] = useState(false);
  const [nicknameOnly,setNicknameOnly] = useState(false);
  const [exporting,setExporting] = useState(false);
  const [notice,setNotice] = useState("");
  const [resetNonce,setResetNonce] = useState(0);
  const [catalogType,setCatalogType] = useState<PersonaCode>("PVSE");
  const [catalogFamily,setCatalogFamily] = useState<Family>("codex");
  const about = useRef<HTMLDialogElement>(null);
  const shown = report ?? demoReport;
  const selectedPersona = personaFor(shown.assessment.type);
  function complete(data: Report, activeSession: LocalSession) {
    setReport(data);setSession(activeSession);setOpen(false);setNicknameOnly(false);
    setFamily(families.find(f=>f.model === data.metrics.mostUsedModelFamily)?.id ?? "codex");
    window.scrollTo({top:0,behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  }
  async function exportPng() {
    setExporting(true);setNotice("");
    try { await downloadCard(shown,style,family,nicknameOnly);setNotice("PNG 已準備下載。圖片不含 Email、會話權杖或使用紀錄。"); } catch(e){setNotice((e as Error).message);} finally{setExporting(false);}
  }
  async function erase() {
    if (session) {
      try {const r=await fetch(`/api/sessions/${session.id}`,{method:"DELETE",headers:{Authorization:`Bearer ${session.readToken}`}});if(!r.ok && ![404,410].includes(r.status))throw new Error("暫時無法刪除，請稍後重試。");}catch(e){setNotice((e as Error).message);return false;}
    }
    sessionStorage.removeItem("ai-persona-session-v1");setSession(null);setReport(null);setResetNonce(n=>n+1);setNotice("此會話已刪除。");return true;
  }
  return <div className="app-root" data-ready={ready} inert={!ready}>
    <header className="site-header"><a className="brand" href="#"><span aria-hidden="true">✧</span>AI 人物誌</a><nav aria-label="主要導覽"><a href="#how">誕生流程</a><a href="#catalog">16 型圖鑑</a><button onClick={()=>about.current?.showModal()}>關於這份觀察</button></nav><span className="project-note">非商業同人企劃</span></header>
    <main>
      <section className={`hero ${report ? "has-report" : ""}`} aria-labelledby="hero-title">
        <div className="hero-copy">
          {report ? <>
            <span className="result-label">{report.kind === "fixture" ? "示範資料 · 非個人評估" : "本期間的使用觀察"}</span>
            <h1 id="hero-title" className="report-title">{shown.nickname}，<br/>你的風格是<br/><em>{shown.assessment.type}。</em></h1>
            <p className="persona-name">{selectedPersona.name}<span>{shown.assessment.level === "unknown" ? "無法定級" : shown.assessment.level} · {levelLabels[shown.assessment.level]}</span></p>
            <p className="hero-description">{selectedPersona.line}<br/>分型是風格，不是分數；未觀察到不等於不會。</p>
            <div className="hero-actions"><button className="primary" onClick={exportPng} disabled={exporting}><Download size={19}/>{exporting ? "正在製作…" : "下載我的角色卡"}</button><a className="text-button" href="#report">閱讀觀察摘要<ArrowRight size={18}/></a></div>
            <label className="check-field nickname-mode"><input type="checkbox" checked={nicknameOnly} onChange={(e)=>setNicknameOnly(e.target.checked)}/>只顯示暱稱，隱藏等級與分型</label>
            <div className="result-tools"><button onClick={async()=>{if(await erase())setOpen(true);}}><RotateCcw size={15}/>重新觀察</button><button onClick={erase}><Trash2 size={15}/>刪除此結果</button></div>
          </> : <>
            <h1 id="hero-title">你怎麼用 AI，<br/>就有什麼<br/><em>專屬形態。</em></h1>
            <p className="hero-description">從真實使用習慣，召喚你的 AI 角色卡。<br/>六個等級、十六種風格，每一次進化都有跡可循。</p>
            <div className="hero-actions"><button className="primary" onClick={()=>setOpen(true)}>召喚我的角色<ArrowRight size={21}/></button><button className="text-button" onClick={()=>{setReport(demoReport);setSession(null);setNicknameOnly(false);}}>先看示範<ArrowRight size={19}/></button></div>
            <p className="privacy-line"><ShieldCheck size={18}/>紀錄留在本機 · 只回傳你確認的摘要</p>
          </>}
          {notice && <p className="inline-notice" role="status">{notice}</p>}
        </div>
        <div className="hero-showcase">
          <HoloCard report={shown} style={style} family={family} nicknameOnly={nicknameOnly}/>
          <div className="style-switch" aria-label="卡片畫風"><button aria-pressed={style === "regular"} onClick={()=>setStyle("regular")}>一般</button><button aria-pressed={style === "chibi"} onClick={()=>setStyle("chibi")}>Q 版</button></div>
          <p className="drag-hint"><Hand size={17}/>拖曳卡片，看看另一道光<span className="reduced-hint">已依偏好使用靜態卡面</span></p>
          {report && <div className="family-select"><label htmlFor="card-family">卡面主題</label><select id="card-family" value={family} onChange={(e)=>setFamily(e.target.value as Family)}>{families.map(f=><option key={f.id} value={f.id}>{f.label}{shown.assessment.type !== "PVSE" ? " · 插圖待製作" : ""}</option>)}</select><small>換畫風或主題不會改變評估結果。</small></div>}
        </div>
      </section>
      <section className="workflow" id="how" aria-label="角色卡誕生流程"><div className="section-rule"><span>✦</span></div>{[
        ["01","授權你的 Agent","選擇自己的紀錄與期間，取得同意後才在本機分析。"],
        ["02","確認摘要再回傳","先看最小 JSON，只送出你核准的使用習慣與彙總。"],
        ["03","收藏你的專屬卡","同一份觀察，一般或 Q 版隨你切換，下載 PNG 收藏。"],
      ].map(([n,title,line])=><div className="workflow-step" key={n}><span>{n}</span><div><h2>{title}</h2><p>{line}</p></div></div>)}</section>
      <div className="quiet-note"><span>使用風格觀察，不是心理測驗。分型是風格，不是分數。</span><button onClick={()=>about.current?.showModal()}>查看來源與署名<ArrowUpRight size={15}/></button></div>
      {report && <section className="report-section" id="report" aria-labelledby="report-heading"><div className="section-heading"><div><p className="section-index">OBSERVATION / 觀察紀錄</p><h2 id="report-heading">你的足跡，<em>有跡可循。</em></h2></div><p>{report.kind === "fixture" ? "此區使用虛構資料示範，沒有讀取你的紀錄。" : "依你授權的 Agent 摘要產生；網站未讀取原始證據。"}<br/>{report.observedPeriod.from} — {report.observedPeriod.to}</p></div>
        <div className="report-grid"><div className="persona"><h3>這次的四種習慣</h3><div className="axes-grid">{Object.entries(report.axes).map(([key,axis],i)=><div key={key}><span className="axis-code">{axis.value}</span><div><small>{["交辦","查核","沉澱","動手"][i]}</small><h4>{axisLabels[axis.value]}</h4><p>{axis.cases.length ? `依據 ${axis.cases.join("、")}` : "保留未知"}</p></div></div>)}</div><p className="fineprint">QAOC 不比 PVSE 差，只是把 AI 用在不同地方。這是本期間的習慣，不是固定人格。</p></div>
        <div className="evidence-summary"><h3>資料覆蓋與用量</h3><dl className="metrics-list"><div><dt>本人會話</dt><dd>{displayCount(report.metrics.humanSessions)}</dd></div><div><dt>自動化 / 子代理</dt><dd>{displayCount(report.metrics.automatedSessions)} / {displayCount(report.metrics.subagentSessions)}</dd></div><div><dt>本人訊息</dt><dd>{displayCount(report.metrics.userMessages)}</dd></div><div><dt>輸入 / 輸出 tokens</dt><dd>{displayCount(report.metrics.inputTokens)} / {displayCount(report.metrics.outputTokens)}</dd></div><div><dt>最常用模型家族</dt><dd>{modelLabels[report.metrics.mostUsedModelFamily]}</dd></div><div><dt>最常用客戶端</dt><dd>{clientLabels[report.metrics.mostUsedClient]}</dd></div></dl><p className="fineprint">用量只描述樣本，不換算成等級。模型家族與客戶端分開記錄。</p></div></div>
        <div className="coverage-strip"><div><strong>證據覆蓋：{report.coverage.scope === "adequate" ? "涵蓋授權範圍" : report.coverage.scope === "partial" ? "部分資料" : "資料不足"}</strong><p>來源：{report.coverage.sources.map(s=>clientLabels[s]).join("、") || "未讀到來源"}；抽樣 {displayCount(report.coverage.sampledSessions)} 個會話。</p></div><div><strong>這次沒看到的部分</strong><p>{report.coverage.gaps.map(g=>gaps[g]).join("、") || "未回報額外缺口；不代表已讀取所有紀錄。"}</p></div></div>
        <p className="level-note">{report.assessment.level === "unknown" ? "目前資料不足以定級。" : `目前可確認至 ${report.assessment.level}；更高等級仍需對應的行為與實作證據。`} LV4 要測試與複用；LV5 需持續、多個獨立工作流程、例外處理與維護回寫。Token 多寡不會讓等級升高。</p>
      </section>}
      <section className="catalog-section" id="catalog" aria-labelledby="catalog-heading"><div className="section-heading"><div><p className="section-index">THE COLLECTION / 風格圖鑑</p><h2 id="catalog-heading">十六種風格。<br/><em>沒有標準答案。</em></h2></div><p>同一套四軸，遇見六個模型家族。<br/>先認識風格，角色插圖將逐步擴充。</p></div><div className="catalog-family" aria-label="圖鑑家族">{families.map(f=><button key={f.id} aria-pressed={catalogFamily === f.id} onClick={()=>setCatalogFamily(f.id)}><i style={{background:f.color}}/>{f.label}</button>)}</div><div className="catalog-body"><div className="type-grid" aria-label="16 種風格">{Object.entries(personas).map(([code,p])=><button key={code} aria-pressed={catalogType === code} onClick={()=>setCatalogType(code as PersonaCode)}><strong>{code}</strong><span>{p.name}</span></button>)}</div><div className="type-description"><span className="large-type">{catalogType}</span><h3>{personas[catalogType].name}</h3><p>{personas[catalogType].line}</p><div className="catalog-axes">{catalogType.split("").map(l=><span key={l}>{l} · {axisLabels[l]}</span>)}</div><p className="art-state">{catalogType === "PVSE" ? "一般／Q 版插圖已完成 · 本頁可體驗" : "此組一般／Q 版插圖尚未製作"}</p><small>這是圖鑑預覽，不會改變你的觀察結果。<br/>目前完成 12 / 192 張規劃插圖。</small></div></div></section>
    </main>
    <footer className="site-footer"><a className="brand" href="#"><span aria-hidden="true">✧</span>AI 人物誌</a><p>六個家族的 PVSE 同人卡 · 12 張一般／Q 版插圖<br/>ApprenTice · 角色參考 ZipZipPipe／DeepSeek 另含上善無形 · AI 輔助再創作</p><button onClick={()=>about.current?.showModal()}>CC BY-NC-SA 4.0<br/>非官方・非商業用途 ↗</button></footer>
    <SessionFlow key={resetNonce} open={open} onClose={()=>setOpen(false)} onComplete={complete}/>
    <dialog ref={about} className="about-dialog" aria-labelledby="about-title"><button className="icon-button dialog-close" onClick={()=>about.current?.close()} aria-label="關閉說明"><X size={22}/></button><h2 id="about-title">這份觀察，<br/><em>從哪裡開始。</em></h2><h3>行為框架</h3><p>採用 <a href="https://github.com/Raymondhou0917/ai-level-check/tree/d262ca67a6efa59ffb0e0a2a2843978a149e047d" target="_blank" rel="noreferrer">Raymondhou0917 / ai-level-check v0.4.6</a>（MIT），保留證據優先、未知不推論與風格不排名。本版是精簡觀察卡，不是原專案完整診斷報告，也不是心理測驗。</p><h3>角色、改編與授權</h3><p>六個家族各提供 PVSE 一般版與 Q 版，共 12 張；其他 180 張尚未製作。Codex 卡採 GPT 娘的主題同人改編，並非官方 Codex 角色。參考改編圖像：<a href="https://github.com/Apprentice-Geo/AI-Fanworks/tree/main/ApprenTice/images" target="_blank" rel="noreferrer">ApprenTice</a>；原作角色參考：ZipZipPipe《大 AI 與小 AI 們》。DeepSeek 另包含上善無形原作角色來源。</p><p>本次為 AI 輔助再創作，依 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>，限非商業並須署名、相同方式分享。已核對 <a href="https://github.com/Apprentice-Geo/AI-Fanworks/blob/main/ApprenTice/README.md" target="_blank" rel="noreferrer">來源作者授權聲明</a>；上游完整權利鏈尚未獨立核實。角色與模型業者沒有官方關係或背書。</p><h3>你決定哪些資料可以離開本機</h3><p>網站不讀取原始對話。暱稱與你核准的結構化摘要暫存於此次會話；選填 Email 只供結果關聯，不寄信、不行銷、不出現在下載圖片。會話 30 分鐘後失效，到期資料於下一次請求清理，也可手動刪除。沒有公開結果網址。</p><p>私人 Sites 的外部提交入口尚未遠端驗證。本機版本不繞過任何存取閘門，也不提供整站通行權杖。</p><a className="text-button" href="/art-provenance.md" target="_blank" rel="noreferrer">完整素材來源與改編紀錄<ArrowUpRight size={17}/></a></dialog>
  </div>;
}
