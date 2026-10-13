"use client";
import {cardComposition,cardSvg} from "../lib/card-composition.ts";
import { useLocale } from "./locale-provider.tsx";
import { useRef, useEffect, type PointerEvent, type KeyboardEvent, type CSSProperties } from "react";
import { artFor, artSlot, artTitle, families, personaFor, type ArtStyle, type Family } from "../lib/catalog.ts";
import type { CardObservation } from "../lib/assessment.ts";
export function HoloCard({ report, style, family, nicknameOnly = false, teaser = false, gallery = false, reveal = false }: {
    report: CardObservation;
    style: ArtStyle;
    family: Family;
    nicknameOnly?: boolean;
    teaser?: boolean;
    gallery?: boolean;
    reveal?: boolean;
}) {
    const { t, locale } = useLocale();
    const card = useRef<HTMLDivElement>(null);
    const motion = useRef(true);
    const dragging = useRef(false);
    const angles = useRef({ x: 4, y: -10 });
    const frame = useRef(0);
    const art = artFor(family, report.assessment.type, style);
    const slot = artSlot(family, report.assessment.type, style);
    const persona = personaFor(report.assessment.type);
    const theme = families.find((f) => f.id === family)!;
    const composition = teaser ? null : cardComposition(report, style, family, nicknameOnly, locale);
    const rarity = composition?.rarity ?? "common";
    useEffect(() => {
        const mq = matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => { motion.current = !mq.matches; if (mq.matches)
            setAngle(0, 0); };
        update();
        mq.addEventListener("change", update);
        return () => { mq.removeEventListener("change", update); cancelAnimationFrame(frame.current); };
    }, []);
    function setAngle(x: number, y: number) {
        angles.current = { x, y };
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            if (!card.current)
                return;
            card.current.style.setProperty("--rx", `${x}deg`);
            card.current.style.setProperty("--ry", `${y}deg`);
            card.current.style.setProperty("--mx", `${50 + y * 2}%`);
            card.current.style.setProperty("--my", `${50 - x * 2}%`);
            card.current.style.setProperty("--shine", `${135 + y * 5}deg`);
        });
    }
    // The idle sway (CSS) owns the angles until the visitor touches the card; leaving hands them back.
    const resume = useRef(0);
    function hold() {
        clearTimeout(resume.current);
        card.current?.setAttribute("data-touched", "");
    }
    function release() {
        setAngle(4, -12);
        clearTimeout(resume.current);
        resume.current = window.setTimeout(() => card.current?.removeAttribute("data-touched"), 260);
    }
    useEffect(() => () => clearTimeout(resume.current), []);
    function move(event: PointerEvent<HTMLDivElement>) {
        if (!motion.current || (event.pointerType !== "mouse" && !dragging.current))
            return;
        hold();
        const rect = event.currentTarget.getBoundingClientRect();
        setAngle(Math.max(-16, Math.min(16, (0.5 - (event.clientY - rect.top) / rect.height) * 30)), Math.max(-19, Math.min(19, ((event.clientX - rect.left) / rect.width - 0.5) * 36)));
    }
    function key(event: KeyboardEvent<HTMLDivElement>) {
        if (!motion.current)
            return;
        hold();
        const { x, y } = angles.current;
        if (event.key === "ArrowLeft")
            setAngle(x, Math.max(-19, y - 4));
        else if (event.key === "ArrowRight")
            setAngle(x, Math.min(19, y + 4));
        else if (event.key === "ArrowUp")
            setAngle(Math.min(16, x + 4), y);
        else if (event.key === "ArrowDown")
            setAngle(Math.max(-16, x - 4), y);
        else if (event.key === "Home")
            setAngle(0, 0);
        else
            return;
        event.preventDefault();
    }
    return <div className="card-stage">
    <div className="orbit orbit-one" aria-hidden="true"><span className="orbit-star star-one">✦</span><span className="orbit-star star-two">✦</span></div>
    <div ref={card} className={reveal ? "holo-card revealing" : "holo-card"} data-testid="holo-card" data-rarity={rarity} style={{ "--family-color": theme.color } as CSSProperties} tabIndex={0} role="group" aria-roledescription={t("可旋轉角色卡")} aria-label={t("{name}卡片，{style}，使用方向鍵或拖曳旋轉",{name:teaser?t("Codex 主題預覽"):report.nickname+" · "+t(nicknameOnly?"暱稱收藏":persona.name),style:t(style==="regular"?"一般":"Q 版")})} onPointerDown={(e) => { if (!motion.current)
        return; dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e); }} onPointerMove={move} onPointerUp={(e) => { dragging.current = false; if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { dragging.current = false; }} onPointerLeave={() => { if (!dragging.current && motion.current)
        release(); }} onKeyDown={key}>
      <div className="card-thickness" aria-hidden="true"/>
      {reveal && <div className="card-back" aria-hidden="true"><span>✧</span></div>}
      {!teaser ? <><div className="card-front" data-art={art??"unknown"} dangerouslySetInnerHTML={{__html:cardSvg(composition!)}}/>{art&&<div className="result-character-foil character-foil" aria-hidden="true" style={{maskImage:"url("+art+")",WebkitMaskImage:"url("+art+")"}}/>}</> : <>
      <div className="card-surface"><div className="card-etch" aria-hidden="true"/><div className="card-rim" aria-hidden="true"/></div>
      <div className="card-heading"><span><i aria-hidden="true">✧</i> {theme.label.toUpperCase()}</span><span>{teaser ? "" : gallery ? t("插畫圖庫") : report.kind === "fixture" ? t("示範卡") : t("觀察卡")}</span></div>
      <div className={"card-art " + style}>{art ? <><img src={art} alt={artTitle(family,locale) + "，" + report.assessment.type + " · " + t(slot!.theme) + "，" + (style === "chibi" ? t("Q 版") : t("一般版"))} draggable={false}/><div className="character-foil" aria-hidden="true" style={{ maskImage: "url(" + art + ")", WebkitMaskImage: "url(" + art + ")" }}/></> : <div className="missing-art" role="img" aria-label={report.assessment.type ? t("此型專屬插畫製作中") : t("尚未定型的中性卡面")}><span aria-hidden="true">✧</span><strong>{report.assessment.type ? t("專屬插畫製作中") : t("輪廓還在形成")}</strong><small>{report.assessment.type ? theme.label + " · " + report.assessment.type + " · " + (style === "chibi" ? t("Q 版") : t("一般")) : t("保留未知，等待更多線索")}</small></div>}</div>
      <div className={`card-copy ${teaser ? "teaser-copy" : nicknameOnly ? "nickname-copy" : ""}`}><div>{teaser ? <><span className="teaser-family">{theme.label.toUpperCase()}</span><span className="teaser-caption">{t("你的 AGENT，專屬形態")}</span></> : <>{!nicknameOnly && <><span className={`card-code ${report.assessment.type ? "" : "untyped"}`}>{report.assessment.type ?? t("未定型")}</span><h2>{t(persona.name)}</h2></>}<span className="card-nickname">{report.nickname}</span></>}</div></div>
      <div className="card-corner corner-left" aria-hidden="true">✦</div><div className="card-corner corner-right" aria-hidden="true">✦</div>
      </>}
      <div className="surface-reflection" aria-hidden="true"/>
      {reveal && <div className="card-glint" aria-hidden="true"/>}
      {(rarity === "epic" || rarity === "legendary") && <div className="rarity-ring" aria-hidden="true"/>}
    </div>
  </div>;
}
