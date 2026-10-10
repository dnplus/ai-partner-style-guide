"use client";

import {useState,useRef} from "react";
import {ArrowLeft,X} from "lucide-react";
import {HoloCard} from "./holo-card.tsx";
import {artSlots,artCounts} from "../lib/art-catalog.ts";
import {families,artCredit,personas,type Family,type ArtStyle} from "../lib/catalog.ts";
import type {TypeCode} from "../lib/contract.ts";

export function ArtGallery(){
  const [family,setFamily]=useState<Family>("codex");
  const [style,setStyle]=useState<ArtStyle>("chibi");
  const [selected,setSelected]=useState<TypeCode>("INTJ");
  const dialog=useRef<HTMLDialogElement>(null);
  const slots=artSlots.filter(s=>s.family===family&&s.style===style);
  const observation=(type:TypeCode)=>({nickname:"插畫展示",kind:"fixture" as const,modelFamily:families.find(f=>f.id===family)!.model,assessment:{type,pattern:type,status:"complete" as const}});
  return <div className="gallery-page">
    <header className="gallery-header"><a href="/"><ArrowLeft size={17}/>回到觀察</a><span>你的 Agent MBTI · 插畫圖庫</span><span className={artCounts.complete ? "art-ready" : "art-pending"}>{artCounts.ready} / {artCounts.total} 張</span></header>
    <main><p className="eyebrow">六個家族 · 十六種風格 · 兩種筆觸</p><h1>每一型，<br/>都有自己的故事。</h1><p className="gallery-intro">插畫依構圖選配，與分型計算獨立。這裡的代碼是目錄，不是你的評估結果。{!artCounts.complete && <>尚有 {192-artCounts.ready} 張製作中，缺圖不以其他插畫替代。</>}</p>
      <div className="gallery-filters"><label htmlFor="gallery-family">角色家族<select id="gallery-family" value={family} onChange={e=>setFamily(e.target.value as Family)}>{families.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label><div className="style-switch" aria-label="圖庫畫風"><button aria-pressed={style==="regular"} onClick={()=>setStyle("regular")}>一般</button><button aria-pressed={style==="chibi"} onClick={()=>setStyle("chibi")}>Q 版</button></div></div>
      <p className="gallery-count" aria-live="polite">{families.find(f=>f.id===family)!.label} · {style==="chibi" ? "Q 版" : "一般"} · {slots.filter(s=>s.status==="ready").length} / 16 張完成</p>
      <div className="art-grid">{slots.map(s=><article key={s.type} data-slot={s.family+":"+s.type+":"+s.style} data-art-status={s.status}>
        <HoloCard report={observation(s.type)} family={family} style={style} gallery/>
        <div className="gallery-caption"><h2>{s.type} <span>{s.theme}</span></h2><p>{personas[s.type].name}</p><button className="quiet-button" onClick={()=>{setSelected(s.type);dialog.current?.showModal();}} aria-label={"放大檢視 "+s.type}>放大檢視</button></div>
      </article>)}</div>
    </main>
    <footer className="gallery-footer"><p>{artCredit(family)}</p><p>CC BY-NC-SA 4.0 · 非官方／非商業 · 角色不代表模型業者背書</p><a href="/art-provenance.md">素材來源與授權</a></footer>
    <dialog ref={dialog} className="art-inspector" aria-labelledby="art-inspector-title"><button className="icon-button dialog-close" aria-label="關閉插畫" onClick={()=>dialog.current?.close()}><X size={23}/></button><h2 id="art-inspector-title">{selected} · {artSlots.find(s=>s.family===family&&s.type===selected&&s.style===style)!.theme}</h2><div className="inspector-card"><HoloCard report={observation(selected)} family={family} style={style} gallery/></div><p>{artSlots.find(s=>s.family===family&&s.type===selected&&s.style===style)!.description}</p><div className="style-switch" aria-label="放大畫風"><button aria-pressed={style==="regular"} onClick={()=>setStyle("regular")}>一般</button><button aria-pressed={style==="chibi"} onClick={()=>setStyle("chibi")}>Q 版</button></div><p className="small-note">可拖曳或用方向鍵旋轉。造型切換不改變分型。</p></dialog>
  </div>;
}
