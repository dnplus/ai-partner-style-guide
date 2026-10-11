"use client";
import { useLocale, LocaleSwitch } from "./locale-provider.tsx";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Copy, Download, X } from "lucide-react";
import {CardShare} from "./card-share.tsx";
import {levelNames,levelDescriptions} from "../lib/usage-level.ts";
import { HoloCard } from "./holo-card.tsx";
import { usePersonaSession } from "./use-persona-session.ts";
import { collectorInstructions } from "../lib/collector-instructions.ts";
import {CollectorScopeOptions} from "./collector-scope-options.tsx";
import {createCollectorScope,collectorScopeSchema,defaultScopeOptions,scopeOptionsSchema,SESSION_TTL_MS,formatScopeWindow,type CollectorScope} from "../lib/collector-scope.ts";
import { makeLevelFixture, demoReport } from "../lib/fixture.ts";
import { toCardObservation, type Report } from "../lib/assessment.ts";
import { families, personas, personaFor, modelLabels, clientLabels, artCredit, artFor, artCounts, type ArtStyle, type Family } from "../lib/catalog.ts";
import { axisDefinitions, letterLabels, letterTips, behaviorLetters, contextLabels } from "../lib/workstyle.ts";
import { downloadCard } from "../lib/export-card.ts";
import { describeProgress } from "../lib/collector-progress.ts";
import {noticeText} from "../lib/i18n.ts";
import { reportCollectorProgress, submitAuthorizedSummary } from "../lib/collector-runner.ts";
type Stage = "cover" | "identity" | "instructions" | "fixture" | "waiting" | "reveal";
const UI_KEY = "agent-mbti-view-v3";
const gaps: Record<string, string> = { web_history_unavailable: "未涵蓋網頁版對話", partial_window: "觀察期間不完整", no_artifact_inspection: "未檢視實作成果", no_tokscale: "沒有 Tokscale 彙總", unattributed_runs: "部分執行無法歸屬", insufficient_records: "紀錄不足", other_sources_missing: "其他工具尚未涵蓋" };
function ReportSummary({report}:{report:Report}){
  const {t,locale}=useLocale();
  const count=(value:number|null)=>value===null?t("未知"):value.toLocaleString(locale);
  const list=(values:string[])=>values.join(locale.startsWith("zh")||locale==="ja"?"、":", ");
  return <>
    <details className="report-details"><summary>{t("打開完整觀察報告")}</summary><div className="report-content">
      <p className="report-period">{report.observedPeriod.from} — {report.observedPeriod.to}</p>
      <h2>{t("使用等級")} · LV {report.usageLevel.value??"?"}</h2><p>{t(report.usageLevel.basis?levelDescriptions[report.usageLevel.basis]:"使用等級尚待更多成果線索。")}</p>
      <h2>{t("你怎麼帶它，它怎麼做事。")}</h2>
      {report.axisFindings.map((axis,i)=><section className="axis-finding" key={axis.axis}>
        <h3>{t(axisDefinitions[i].name)} · {t(axis.value==="?"?(axis.reason==="near_boundary"?"證據分歧，暫不定向":"證據還不夠"):letterLabels[axis.value])}</h3>
        <p>{t("{total} 個獨立有效任務：{left} {leftCount} 個、{right} {rightCount} 個、混合 {mixed} 個。",{total:count(axis.eligibleTasks),left:axisDefinitions[i].left,leftCount:count(axis.leftTasks.length),right:axisDefinitions[i].right,rightCount:count(axis.rightTasks.length),mixed:count(axis.mixedTasks.length)})} {axis.excludedTasks.length>0&&t("另有 {count} 個任務含受限、不明或不符合主人要求的觀察，這些觀察未計入。",{count:count(axis.excludedTasks.length)})}</p>
        <p>{t(axis.value==="?"?axisDefinitions[i].prompt:letterTips[axis.value])}</p>
      </section>)}
      <h2>{t("這次看到了多少？")}</h2><p>{t("證據覆蓋：{scope}。抽樣 {count} 個會話；來源：{sources}。",{scope:t(report.coverage.scope==="adequate"?"涵蓋授權範圍":report.coverage.scope==="partial"?"部分資料":"資料不足"),count:count(report.coverage.sampledSessions),sources:list(report.coverage.sources.map(s=>t(clientLabels[s])))||t("尚未取得")})}</p>
      <dl className="metrics-list">{[["本人會話",count(report.metrics.humanSessions)],["自動化 / 子代理",count(report.metrics.automatedSessions)+" / "+count(report.metrics.subagentSessions)],["本人訊息",count(report.metrics.userMessages)],["輸入 / 輸出 tokens",count(report.metrics.inputTokens)+" / "+count(report.metrics.outputTokens)],["最常用模型家族",t(modelLabels[report.metrics.mostUsedModelFamily])],["最常用客戶端",t(clientLabels[report.metrics.mostUsedClient])]].map(([label,value])=><div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>
      <details className="evidence-details"><summary>{t("看任務脈絡與主人要求")}</summary>{report.tasks.map(task=><section className="task-evidence" key={task.id}><h3>{task.id} · {t(contextLabels[task.context])}</h3><p>{task.date} · {t(clientLabels[task.source])}</p><ul>{report.observations.filter(o=>o.task===task.id).map(o=><li key={o.id}><span>{t("主人：")}{t(o.ownerRequest==="unknown"?"要求未能確認":o.ownerRequest==="not_specified"?"未指定方向":letterLabels[behaviorLetters[o.ownerRequest]])}</span><span>{t("實際：")}{t(letterLabels[behaviorLetters[o.behavior]])} · {t(o.opportunity==="both_available"?"兩端可選":o.opportunity==="constrained"?"情境受限":"可選性不明")}</span></li>)}</ul></section>)}</details>
      <h2>{t("還沒看到的部分")}</h2><p>{list(report.coverage.gaps.map(g=>t(gaps[g])))||t("沒有回報額外缺口；不代表已讀取所有紀錄。")} {t("網站只檢查 Agent 摘要的一致性，沒有檢視原始紀錄。")}</p>
      <p className="fineprint">{t(report.caveat)} {t("每軸至少三個獨立任務；方向不明或不足時保留未知。內部門檻不是準確率或性格強度，用量與模型家族不參與分型。")}</p>
    </div></details>
  </>;
}
export function PersonaApp({authenticated=false,signInHref="/signin-with-chatgpt?return_to=%2F",signOutHref="/signout-with-chatgpt?return_to=%2F"}:{authenticated?:boolean;signInHref?:string;signOutHref?:string}) {
    const { t, locale, ready: localeReady } = useLocale();
    const flow = usePersonaSession(authenticated);
    const [stage, setStage] = useState<Stage>("cover");
    const [nickname, setNickname] = useState("");
    const [marketingOptIn,setMarketingOptIn]=useState(false);
    const [marketingSaved,setMarketingSaved]=useState(false);
    const [style, setStyle] = useState<ArtStyle>("chibi");
    const [family, setFamily] = useState<Family>("codex");
    const [nicknameOnly, setNicknameOnly] = useState(false);
    const [manual, setManual] = useState(false);
    const [notice, setNotice] = useState("");
    const [exporting, setExporting] = useState(false);
    const [demo, setDemo] = useState(false);
    const [resumeMode, setResumeMode] = useState(false);
    const [fixtureConsent, setFixtureConsent] = useState(false);
    const [sending, setSending] = useState(false);
    const [origin, setOrigin] = useState("");
    const [timeZone,setTimeZone]=useState("UTC");
    const [scopeOptions,setScopeOptions]=useState(defaultScopeOptions);
    const [collectionScope,setCollectionScope]=useState<CollectorScope|null>(null);
    const about = useRef<HTMLDialogElement>(null);
    const focus = useRef<HTMLElement>(null);
    const received = useRef<string | null>(null);
    const initialized = useRef(false);
    const restoreStage = useRef<Stage | null>(null);
    const fixtureKey = useRef("");
    const active = flow.session;
    const result = flow.result;
    const card = result?.card ?? toCardObservation(demoReport);
    const expired = !!active && flow.expired && !result;
    const progress = stage === "identity" ? 1 : ["instructions", "fixture", "waiting"].includes(stage) ? 2 : 3;
    const effectiveScope=active?(collectionScope??createCollectorScope(active.expiresAt-SESSION_TTL_MS,timeZone)):null;
    const instructions = active ? collectorInstructions(active, origin, resumeMode, locale,effectiveScope!) : "";
    const agentState = describeProgress(flow.agentProgress, flow.clock, locale);
    const countdown = `${Math.floor(flow.remaining / 60).toString().padStart(2, "0")}:${(flow.remaining % 60).toString().padStart(2, "0")}`;
    useEffect(() => { setOrigin(location.origin);setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"); }, []);
    useEffect(() => {
        if (!flow.ready || initialized.current)
            return;
        initialized.current = true;
        if (!active&&authenticated&&new URLSearchParams(location.search).get("start")==="1"){setStage("identity");history.replaceState(null,"",location.pathname);}
        if (active) {
            setNickname(active.nickname);
            setStage("waiting");
            try {
                const saved = JSON.parse(sessionStorage.getItem(UI_KEY) ?? "null");
                if (saved?.id === active.id) {
                    if (saved.stage === "reveal") restoreStage.current = "reveal";
                    if (["regular", "chibi"].includes(saved.style))
                        setStyle(saved.style);
                    if (families.some(f => f.id === saved.family))
                        setFamily(saved.family);
                    setNicknameOnly(saved.nicknameOnly === true);
                    setDemo(saved.demo === true);
                    setResumeMode(saved.resumeMode === true);
                    const scope=collectorScopeSchema.safeParse(saved.collectionScope);
                    if(scope.success){setCollectionScope(scope.data);setScopeOptions(scope.data.options);}
                }
            }
            catch { }
        }
    }, [flow.ready, active]);
    useEffect(() => {
        if (!result || received.current === result.id)
            return;
        received.current = result.id;
        if (!restoreStage.current)
            setFamily(families.find(f => f.model === result.card.modelFamily)?.id ?? "codex");
        setStage("reveal");
        restoreStage.current = null;
        setNotice("");
        setManual(false);
    }, [result, active]);
    useEffect(() => {
        if (active && initialized.current) {
            try {
                sessionStorage.setItem(UI_KEY, JSON.stringify({ id: active.id, stage, style, family, nicknameOnly, demo, resumeMode,collectionScope }));
            }
            catch { }
        }
    }, [active, stage, style, family, nicknameOnly, demo, resumeMode,collectionScope]);
    useEffect(() => {
        if (!flow.ready)
            return;
        window.scrollTo({ top: 0, behavior: "instant" });
        const timer = setTimeout(() => focus.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true }), 50);
        return () => clearTimeout(timer);
    }, [stage, flow.ready]);
    useEffect(()=>{if(!authenticated)return;let live=true;void fetch("/api/account",{cache:"no-store",redirect:"error"}).then(r=>r.json()).then(data=>{if(live)setMarketingSaved((data as {marketingOptIn?:boolean}).marketingOptIn===true);}).catch(()=>{});return ()=>{live=false;};},[authenticated,active?.id]);
    async function withdrawMarketing(){try{const r=await fetch("/api/account",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({marketingOptIn:false}),redirect:"error"});if(!r.ok)throw new Error();setMarketingSaved(false);setMarketingOptIn(false);}catch{setNotice("偏好暫時無法更新，請重試。");}}
    function go(next: Stage) { setNotice(""); flow.setError(""); setStage(next); }
    function back() {
        const previous: Record<Stage, Stage> = { cover: "cover", identity: "cover", instructions: "identity", fixture: "instructions", waiting: "instructions", reveal: "cover" };
        go(previous[stage]);
    }
    function start() {
        if (result)
            go("reveal");
        else if (flow.lastResult){ flow.openLast(); go("reveal"); }
        else if (active)
            go("waiting");
        else
            go("identity");
    }
    async function startNew(){if(await flow.startFresh()){received.current=null;restoreStage.current=null;setNickname("");setMarketingOptIn(false);setResumeMode(false);setDemo(false);setNicknameOnly(false);setCollectionScope(null);sessionStorage.removeItem(UI_KEY);go("identity");}}
    async function create(event: FormEvent) {
        event.preventDefault();
        setNotice("");
        if (active && !flow.expired) {
            go("instructions");
            return;
        }
        if(!scopeOptionsSchema.safeParse(scopeOptions).success){setNotice("請選擇至少一個來源，觀察天數需為 1–365 天。");return;}
        const next = await flow.create({nickname,marketingOptIn});
        if (next) {
            if(!resumeMode||!collectionScope)setCollectionScope(createCollectorScope(next.expiresAt-SESSION_TTL_MS,timeZone,scopeOptions));
            fixtureKey.current = crypto.randomUUID();
            setNicknameOnly(false);
            setFixtureConsent(false);
            setManual(false);
            go("instructions");
        }
    }
    async function copy() {
        try {
            await navigator.clipboard.writeText(instructions);
            go("waiting");
        }
        catch {
            setManual(true);
            setNotice("自動複製未成功，請選取下方指令手動複製。");
        }
    }
    async function erase(next: Stage = "cover") {
        if (await flow.erase()) {
            sessionStorage.removeItem(UI_KEY);
            received.current = null;
            restoreStage.current = null;
            setFixtureConsent(false);
            setMarketingOptIn(false);
            setManual(false);
            setNotice("");
            setStage(next);
            if (next === "cover") {
                setDemo(false);
                setResumeMode(false);
                setNickname("");
                setMarketingOptIn(false);
                setScopeOptions(defaultScopeOptions());setCollectionScope(null);
            }
            about.current?.close();
            return true;
        }
        return false;
    }
    async function renew() {
        if (await erase("identity"))
            setResumeMode(true);
    }
    async function sendFixture() {
        if (!active?.writeToken || !fixtureConsent || sending)
            return;
        setSending(true);
        setNotice("");
        try {
            fixtureKey.current ||= crypto.randomUUID();
            const sample = makeLevelFixture(active.nickname);
            const target = { origin, id: active.id, writeToken: active.writeToken, expiresAt: active.expiresAt, nickname: active.nickname };
            const grant = { scopeApproved: true as const, sourceOwnershipConfirmed: true as const, origin, sessionId: active.id, expiresAt: active.expiresAt, nickname: active.nickname, sources: sample.coverage.sources, period: sample.observedPeriod };
            go("waiting");
            await reportCollectorProgress(grant, target, { sequence: 1, phase: "validating", approvalKind: null });
            const outcome = await submitAuthorizedSummary(sample, grant, target, fixtureKey.current);
            if (outcome.status !== "accepted")
                throw new Error(outcome.status === "expired" ? "這個連結已失效，請換新連結後重新授權。" : "範例尚未確認送達，請重試。");
            flow.retry();
        }
        catch (e) {
            setNotice((e as Error).message);
        }
        finally {
            setSending(false);
        }
    }
    async function exportPng() {
        if (!result)
            return;
        setExporting(true);
        setNotice("");
        try {
            await downloadCard(result.card, style, family, nicknameOnly, locale);
            setNotice("圖片已準備下載，含角色署名與授權。");
        }
        catch (e) {
            setNotice((e as Error).message);
        }
        finally {
            setExporting(false);
        }
    }
    return <div className="app-root" data-ready={flow.ready && localeReady} data-stage={stage} inert={!flow.ready || !localeReady}>
    <header className="journey-header">
      {stage !== "cover" && stage!=="reveal" && <button className="back-button" aria-label={t("返回上一步")} disabled={flow.busy || sending} onClick={back}><ArrowLeft size={22}/></button>}
      <div className="brand"><span aria-hidden="true">✧</span>{t("你的 Agent MBTI")}<span aria-hidden="true">✧</span></div>
      {demo && stage !== "cover" && <span className="demo-badge">{t("示範")}</span>}
    </header>
    {stage !== "cover" && <div className="journey-progress" aria-label={t("第 {step} 個階段，共 3 個階段",{step:progress})}><div><i style={{ width: `${progress / 3 * 100}%` }}/></div><span>{progress} / 3</span></div>}
    <main ref={focus} className={`journey journey-${stage}`}>
      {stage === "cover" && <section className="cover-screen screen" aria-labelledby="cover-title">
        <h1 id="cover-title" tabIndex={-1}>{t("你的 Agent，")}<br />{t("是哪一種 MBTI？")}</h1>
        <p className="cover-tagline">{t("你怎麼帶它做事，")}<br className="mobile-break"/>{t("它就長出怎樣的工作風格。")}</p><div className="cover-art"><HoloCard report={toCardObservation(demoReport)} style="chibi" family="codex" nicknameOnly teaser/></div>
        {authenticated?<button className="primary" onClick={start}>{flow.lastResult ? t("打開上次的卡片") : active ? t("繼續這次觀察") : t("開始觀察")}<ArrowRight size={22}/></button>:<a className="primary sign-in" href={signInHref} target="_top">{t("使用 ChatGPT 登入開始")}<ArrowRight size={22}/></a>}{flow.lastResult&&<div className="remembered-actions"><button className="quiet-button" onClick={startNew}>{t("開始新的觀察")}</button><button className="quiet-button" onClick={()=>erase()}>{t("清除上次結果")}</button></div>}
      </section>}
      {stage !== "cover" && expired ? <section className="screen recovery-screen"><div className="sealed-card" aria-hidden="true"><span>✧</span></div><h1 tabIndex={-1}>{t("這道光，")}<br />{t("暫時收起了。")}</h1><p className="lead">{t("連結已到期或失效。請讓 Agent 保留已整理的最小摘要，")}<br />{t("換新連結後，只需明確核准新的收件目的地。")}</p><button className="primary" disabled={flow.busy} onClick={renew}>{t("沿用分析，換新連結")}<ArrowRight size={20}/></button></section> : <>
      {stage === "identity" && <section className="identity-screen screen">
        <img className="identity-art" src={artFor("codex", "INTJ", "chibi")!} alt=""/>
        <h1 tabIndex={-1}>{active ? <>{t("你的連結，")}<br />{t("還在等你。")}</> : <>{t("這位搭檔，")}<br />{t("該怎麼稱呼？")}</>}</h1>{resumeMode && !active && <p className="small-note renewal-note">{t("將建立新的收件連結。舊連結不延長；新指令會要求你明確核准新目的地，已保存的最小摘要可繼續使用。")}</p>}
        <form onSubmit={create} className="identity-form">
          <label className="sr-only" htmlFor="nickname">{t("Agent 的名字")}</label><input id="nickname" className="nickname-input" autoComplete="off" placeholder={t("Agent 的名字")} value={active?.nickname ?? nickname} onInvalid={e=>e.currentTarget.setCustomValidity(t("請填寫 Agent 的名字。"))} onInput={e=>e.currentTarget.setCustomValidity("")} onChange={e => setNickname(e.target.value)} required maxLength={24} readOnly={!!active}/>
          <p className="field-caption">{active ? t("返回不會建立第二個連結") : t("這個名字會出現在卡片上")}</p>
          {!active&&<div className="start-consent"><p>{t("使用 ChatGPT 帳戶的 Email 提供這次完整報告，寄送功能尚未開放。")}</p><label className="check-field"><input type="checkbox" checked={marketingOptIn} onChange={e=>setMarketingOptIn(e.target.checked)}/>{t("我願意收到新功能與活動消息（選填，可隨時取消）。")}</label></div>}
          {!active&&!demo&&!resumeMode&&<CollectorScopeOptions value={scopeOptions} onChange={setScopeOptions} timeZone={timeZone}/>}
          <button className="primary wide" disabled={flow.busy}>{flow.busy ? t("建立中…") : active ? t("繼續這個連結") : t("建立我的連結")}<ArrowRight size={20}/></button>
        </form>
      </section>}
      {stage === "instructions" && active && <section className="instructions-screen screen">
        <div className="sealed-card small" aria-hidden="true"><span>✧</span></div>
        <h1 tabIndex={-1}>{demo ? <>{t("先選好，")}<br />{t("這次觀察的範圍。")}</> : <>{t("把這段指令，")}<br />{t("交給你的 Agent。")}</>}</h1>
        <p className="lead">{demo ? t("使用虛構資料，走過同一個收件流程。") : <>{t("範圍已替你填好，只需同意一次。")}<br />{t("同意後自動完成，回來這裡看結果。")}</>}</p>
        {!demo&&effectiveScope&&<details className="scope-window"><summary>{t("查看這次範圍")}</summary><p>{formatScopeWindow(effectiveScope,locale)}</p><p>{t(effectiveScope.options.sourceMode==="all_supported_local"?"所有支援本機來源":"已選來源")}{effectiveScope.options.sourceMode==="selected"?" · "+effectiveScope.options.sources.join(", "):""} · {effectiveScope.options.includeTokscale?"Tokscale":t("不含 Tokscale")}</p></details>}
        {active.writeToken ? <>
          <button className="primary" onClick={demo ? () => go("fixture") : copy}>{demo ? t("查看示範範圍") : t("複製專屬指令")}{demo ? <ArrowRight size={20}/> : <Copy size={19}/>}</button>
          {!demo && <details className="instruction-disclosure" open={manual} onToggle={e => setManual(e.currentTarget.open)}><summary>{t("查看／手動複製指令")}</summary><textarea className="instruction-box" aria-label={t("貼給 Agent 的指令")} value={instructions} readOnly onFocus={e => e.currentTarget.select()}/><button className="quiet-button" onClick={() => go("waiting")}>{t("我已複製，開始等待")}<ArrowRight size={16}/></button></details>}
        </> : <><p className="small-note">{t("重整後不保留提交權杖。已複製的指令仍可使用。")}</p><button className="primary" onClick={() => go("waiting")}>{t("繼續等待")}<ArrowRight size={20}/></button><button className="quiet-button" disabled={flow.busy} onClick={renew}>{t("沒複製到？換新連結")}</button></>}
        <p className="small-note">{t("連結剩餘 {time}",{time:countdown})} {t(origin.startsWith("http://127.0.0.1")?"· 目前僅限同一台電腦使用":" · 可在已授權的 Agent 使用")}</p>
      </section>}
      {stage === "fixture" && active && <section className="fixture-screen screen">
        <p className="eyebrow">{t("虛構資料 · 沒有讀取你的紀錄")}</p><h1 tabIndex={-1}>{t("一次同意，")}<br />{t("接著等它揭曉。")}</h1><p className="lead">{t("確認這次範圍，剩下的自動完成。")}</p>
        <div className="scope-card"><p><b>{t("來源與期間")}</b><span>{t("網站內建的 3 個虛構任務，2026/10/01–10/09。沒有你的對話。")}</span></p><p><b>{t("傳送內容")}</b><span>{t("暱稱、日期、來源與缺口、用量彙總、抽象任務與行為列舉、衍生分型及階段狀態。")}</span></p><p><b>{t("目的地")}</b><span>{t("目前網站的這個收件連結，有效至 {time}。",{time:new Date(active.expiresAt).toLocaleTimeString(locale,{hour12:false})})}</span></p></div>
        <label className="check-field"><input type="checkbox" checked={fixtureConsent} onChange={e => setFixtureConsent(e.target.checked)}/>{t("我同意此範圍的虛構摘要自動驗證並傳送。")}</label>
        <button className="primary" disabled={!fixtureConsent || sending} onClick={sendFixture}>{sending ? t("處理中…") : t("同意並開始示範")}<ArrowRight size={20}/></button>
      </section>}
      {stage === "waiting" && <section className="waiting-screen screen">
        <div className="sealed-card" aria-hidden="true"><span>✧</span></div>
        <h1 tabIndex={-1}>{flow.connection === "retrying" ? <>{t("正在重新連上，")}<br />{t("請稍等一下。")}</> : <>{t("等它帶回，")}<br />{t("你們的合作線索。")}</>}</h1>
        <div className={"waiting-status " + flow.connection} role="status"><i />{flow.connection === "retrying" ? t("網站暫時連不上收件服務") : flow.connection === "checking" ? t("正在確認收件狀態") : agentState.title}</div>
        {(flow.connection==="retrying"||agentState.stale||["awaiting_host_approval","paused"].includes(flow.agentProgress.phase))&&<p className="lead waiting-explanation">{flow.connection==="retrying"?t("這不代表 Agent 中斷。網站會自動重試，請保留這個分頁。"):agentState.details}</p>}
        <details className="waiting-help"><summary>{t("查看進度與協助")}</summary><p>{t("連結剩餘 {time}",{time:countdown})}</p>{flow.agentProgress.updatedAt&&<p>{t("最後訊號：")}{agentState.lastPhase} · {new Date(flow.agentProgress.updatedAt).toLocaleTimeString(locale,{hour12:false})}</p>}<button className="quiet-button" onClick={()=>go("instructions")}>{t("重看指令")}</button>{flow.connection==="retrying"&&<button className="quiet-button" onClick={flow.retry}>{t("立即重試")}</button>}<p>{t("只需在 Agent 確認一次來源、期間與摘要傳送範圍。若主機另外要求讀取或連線核准，請在原生提示處處理；網站不會代替核准。")}</p><p>{t("超過 90 秒沒有新階段訊號時，我們會明確標示未知。若分析已完成，請 Agent 保留最小摘要；換連結後明確核准新目的地，不用重掃資料。")}</p>{flow.lastChecked && <p>{t("網站上次連上收件服務：")}{new Date(flow.lastChecked).toLocaleTimeString(locale, { hour12: false })}</p>}<button className="quiet-button" disabled={flow.busy} onClick={renew}>{t("沿用分析，換新連結")}</button></details>
      </section>}
      {stage === "reveal" && result && <section className="reveal-screen screen final-screen">
        <div className="final-card-area"><div className="reveal-art"><HoloCard report={card} style={style} family={family} nicknameOnly={nicknameOnly}/></div><div className="style-switch" aria-label={t("卡片畫風")}><button aria-pressed={style==="regular"} onClick={()=>setStyle("regular")}>{t("一般")}</button><button aria-pressed={style==="chibi"} onClick={()=>setStyle("chibi")}>{t("Q 版")}</button></div><p className="drag-hint"><span className="motion-hint">{t("拖曳卡片，看看另一道光")}</span><span className="reduced-hint">{t("已依偏好使用靜態卡面")}</span></p></div>
        <div className="final-copy">{card.kind==="fixture"&&<p className="eyebrow">{t("示範資料 · 非個人評估")}</p>}<h1 tabIndex={-1}>{card.nickname}</h1><p className="final-subtitle">{t(personaFor(card.assessment.type).name)}</p><div className="brief-reading">{card.brief.map(line=><p key={line}>{t(line)}</p>)}</div>
        <div className="final-actions"><button className="primary" onClick={exportPng} disabled={exporting||!!card.assessment.type&&!artFor(family,card.assessment.type,style)}>{exporting?t("製作圖片中…"):t("下載我的角色卡")}<Download size={20}/></button><CardShare card={card} style={style} family={family} nicknameOnly={nicknameOnly}/></div>
        <details className="card-options"><summary>{t("卡片選項")}</summary><div><label htmlFor="card-family">{t("卡面主題")}</label><select id="card-family" value={family} onChange={e=>setFamily(e.target.value as Family)}>{families.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select><label className="check-field"><input type="checkbox" checked={nicknameOnly} onChange={e=>setNicknameOnly(e.target.checked)}/>{t("只顯示暱稱，隱藏分型")}</label><p>{t("此選項也會隱藏等級與短句。")}</p></div></details>
        {result.report&&<div className="inline-report"><ReportSummary report={result.report}/><details className="delivery-details"><summary>{t("報告與寄送狀態")}</summary><p>{t("Email 寄送尚未開放；完整報告可在這裡查看。")}</p></details></div>}
        <div className="result-management"><button className="quiet-button" onClick={startNew}>{t("開始新的觀察")}</button><button className="quiet-button" disabled={flow.busy} onClick={()=>erase()}>{t("清除這次結果")}</button></div>{flow.rememberError&&<p className="small-note">{t("此裝置暫時無法記住結果，請先下載卡片。")}</p>}</div>
      </section>}
      </>}
      {(flow.error || notice) && <p className="inline-notice" role="status">{noticeText(locale,flow.error || notice)}</p>}
    </main>
    <footer className="journey-footer"><LocaleSwitch /><button onClick={() => about.current?.showModal()}>{t("關於這份觀察")}</button></footer>
    <dialog ref={about} className="about-dialog" aria-labelledby="about-title"><button className="icon-button dialog-close" onClick={() => about.current?.close()} aria-label={t("關閉說明")}><X size={22}/></button><h2 id="about-title">{t("你怎麼帶它，")}<br />{t("它就怎麼做事。")}</h2><p>{t("這是一段以授權使用紀錄為依據的合作觀察。借用四組字母，以自訂規則描述合作風格，非官方 MBTI 評量。網站只接收你事前明確授權範圍內的最小摘要，授權後自動驗證與傳送。")}</p>
      <details><summary>{t("觀察依據與 16 種風格")}</summary><p>{t("借用 E/I 互動節奏、S/N 理解起點、T/F 取捨依據、J/P 推進方式，以原創規則觀察主人帶領 Agent 的實際合作。這不是人的人格診斷，也不是模型的固定性格。")}</p><p>{t("每軸至少三個獨立任務；同一任務只算一次。受限情境不計入，接近或不足就保留未知。舊結果需要重新分析。")}<a href="/collector/SKILL.md" target="_blank" rel="noreferrer">{t("完整觀察方式 ↗")}</a></p><div className="about-types">{Object.entries(personas).map(([code, p]) => <div key={code}><b>{code}</b><span>{t(p.name)}</span></div>)}</div></details>
      <details><summary>{t("使用等級如何判斷")}</summary><p>{t("等級與 MBTI、用量和模型無關。LV0–3 看你帶 Agent 時怎麼查核與修正；LV4 看你寫下的技能、規則或腳本，是否被其他工作階段再次使用；LV5 再看自動化是否無人值守跑過兩週，且資產持續維護。沒有證據就保持未知，等級也不代表能力上限。")}</p></details>
      <details><summary>{t("角色來源與非商業授權")}</summary><p>{t("六個家族 × 16 型 × 一般／Q 版，共 192 格專屬插畫。目前")}{artCounts.ready}{t("張完成")}{artCounts.complete ? t("。") : t("，其餘製作中，缺圖不以其他型替代。")}{t("插畫依構圖選配，與分型計算獨立。Codex 使用 GPT 娘的同人改編，並非官方 Codex 角色。圖片改編參考")}<a href="https://github.com/Apprentice-Geo/AI-Fanworks/tree/main/ApprenTice/images" target="_blank" rel="noreferrer">ApprenTice</a>{t("；角色原作參考 ZipZipPipe，DeepSeek 另含上善無形。")}</p><p>{t("AI 輔助再創作，")}<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a>{t("，限非商業、署名及相同方式分享。上游權利鏈尚未全面核實，沒有模型業者背書。")}</p><a href="/art-provenance.md" target="_blank" rel="noreferrer">{t("完整素材來源 ↗")}</a><br /><a href="/art-gallery">{t("瀏覽全部插畫圖庫 ↗")}</a></details>
      <details><summary>{t("資料與 Email 如何使用")}</summary><p>{t("Email 由 ChatGPT 登入提供，不出現在卡片。完整報告不以行銷同意為條件。目前只保存偏好，沒有寄信或加入外部行銷服務。")}</p><p>{t("提交連結 30 分鐘後失效。此裝置可用安全 Cookie 開啟最近結果，最長保留 7 天；可隨時清除。Email、原始紀錄與提交權杖不存入瀏覽器儲存空間，結果沒有公開網址。")}</p><p>{t("首頁可公開開啟；開始觀察、讀取結果及帳戶偏好均需本人登入。Agent 只能透過短效專屬連結提交一次摘要，不能讀取私人結果。")}</p></details>
      {authenticated&&<details><summary>{t("帳戶與行銷偏好")}</summary><p>{t(marketingSaved?"已同意接收新功能與活動消息。":"沒有訂閱行銷消息。")}</p>{marketingSaved&&<button className="quiet-button" onClick={withdrawMarketing}>{t("取消行銷同意")}</button>}<p><a href={signOutHref} target="_top">{t("登出 ChatGPT")}</a></p></details>}
      {!active&&authenticated && <button className="quiet-button demo-entry" onClick={() => { setDemo(true); setNickname(t("示範搭檔")); about.current?.close(); go("identity"); }}>{t("使用虛構資料體驗")}<ArrowRight size={16}/></button>}
      {(active||flow.lastResult) && <button className="quiet-button danger-action" disabled={flow.busy} onClick={() => erase()}>{t("結束觀察並刪除資料")}</button>}
      {flow.error && <p role="alert">{noticeText(locale,flow.error)}</p>}
    </dialog>
  </div>;
}
