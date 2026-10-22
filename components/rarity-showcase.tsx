"use client";
import {HoloCard} from "./holo-card.tsx";
import {translator, type Locale} from "../lib/i18n.ts";
import {decidedAssessment} from "../lib/assessment.ts";
import {families, personas, type Family} from "../lib/catalog.ts";
import {rarityDescriptions, rarityNames, type Rarity} from "../lib/rarity.ts";
import type {TypeCode} from "../lib/contract.ts";

// One real card per rarity, highest first, each in the frame a visitor would actually get.
const tiers: {rarity: Rarity; level: number; family: Family; type: TypeCode}[] = [
  {rarity: "legendary", level: 5, family: "claude", type: "ENFJ"},
  {rarity: "epic", level: 4, family: "gemini", type: "INTP"},
  {rarity: "rare", level: 2, family: "grok", type: "ESTP"},
  {rarity: "common", level: 0, family: "codex", type: "ISFP"},
];

// The page passes its own language, so the captions match the URL's ?lang= rather than the visitor's stored choice.
export function RarityShowcase({locale}: {locale: Locale}) {
  const t = translator(locale);
  return <ol className="rarity-showcase">{tiers.map((tier) => <li key={tier.rarity} data-rarity={tier.rarity}>
    <HoloCard style="chibi" family={tier.family} report={{usageLevel: {version: "usage-level-v2", value: tier.level, basis: null}, brief: [], nickname: t(personas[tier.type].name), kind: "observed", modelFamily: families.find((f) => f.id === tier.family)!.model, assessment: decidedAssessment(tier.type), selfType: null}}/>
    <h2>{t(rarityNames[tier.rarity])}</h2>
    <p>{t(rarityDescriptions[tier.rarity])}</p>
  </li>)}</ol>;
}
