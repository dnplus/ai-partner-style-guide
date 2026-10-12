"use client";
import Link from "next/link";
import {ArrowRight} from "lucide-react";
import {useLocale, LocaleSwitch} from "./locale-provider.tsx";
import {HoloCard} from "./holo-card.tsx";
import {personaFor} from "../lib/catalog.ts";
import {measuredCode} from "../lib/card-composition.ts";
import type {PublicCard} from "../lib/public-card-service.ts";

export function PublicCardView({data}: {data: PublicCard | null}) {
  const {t, ready} = useLocale();
  const card = data?.card;
  return <div className="app-root public-root" data-ready={ready}>
    <header className="journey-header"><div className="brand"><span aria-hidden="true">✧</span>{t("你的 Agent MBTI")}<span aria-hidden="true">✧</span></div></header>
    <main className="public-card-page">
      {data && card ? <section className="final-screen public-card">
        <div className="final-card-area"><div className="reveal-art"><HoloCard report={card} style={data.style} family={data.family} nicknameOnly={data.nicknameOnly}/></div></div>
        <div className="final-copy">
          <p className="eyebrow public-verified">{t("由網站依提交紀錄產生 · {date}", {date: new Date(data.createdAt).toISOString().slice(0, 10)})}</p>
          <h1>{card.nickname}</h1>
          {!data.nicknameOnly && <p className="final-subtitle">{measuredCode(card, t)} · {t(personaFor(card.assessment.type).name)} · LV {card.usageLevel.value ?? "?"}</p>}
          {!data.nicknameOnly && <div className="brief-reading">{card.brief.map((line) => <p key={line}>{t(line)}</p>)}</div>}
          <p className="small-note">{t("這張卡由網站依當次提交的摘要畫出，和本人下載的圖片內容一致才是真的。摘要由本人的 Agent 在本機計算，網站無法檢視原始紀錄。")}</p>
          <Link className="primary public-cta" href="/">{t("測測你的 Agent 是哪一型")}<ArrowRight size={20}/></Link>
        </div>
      </section> : <section className="screen recovery-screen">
        <div className="sealed-card" aria-hidden="true"><span>✧</span></div>
        <h1>{t("這張卡已撤回或過期。")}</h1>
        <Link className="primary" href="/">{t("測測你的 Agent 是哪一型")}<ArrowRight size={20}/></Link>
      </section>}
    </main>
    <footer className="journey-footer"><LocaleSwitch/></footer>
  </div>;
}
