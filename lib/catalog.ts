import {translator,type Locale} from "./i18n.ts";
import type { TypeCode } from "./contract.ts";

export const personas: Record<TypeCode, { name: string; line: string }> = {
  INTJ: { name: "路線策畫家", line: "先看見可能，再替下一步畫好路線。" },
  INTP: { name: "模型探索者", line: "把想法拆開比一比，讓更好的解釋慢慢成形。" },
  ENTJ: { name: "推進指揮官", line: "邊對焦、邊定方向，讓共同目標往前走。" },
  ENTP: { name: "可能性開拓者", line: "用來回激盪打開選項，再用小實驗找到答案。" },
  INFJ: { name: "願景陪跑者", line: "把人的期待放進遠景，整理成可以前進的路。" },
  INFP: { name: "價值守望者", line: "留一點探索空間，讓答案靠近真正重視的事。" },
  ENFJ: { name: "共識召集人", line: "聽懂彼此在乎什麼，帶著大家走向共同方向。" },
  ENFP: { name: "靈感串連者", line: "在對話中連起人與可能，讓新點子有地方落腳。" },
  ISTJ: { name: "細節執行家", line: "整理手上的事實，沿著清楚的標準穩穩推進。" },
  ISFJ: { name: "周到支援者", line: "看見實際需要，把每個照顧放進安排。" },
  ESTJ: { name: "秩序推進者", line: "從現況對焦分工，讓準則和節奏一起到位。" },
  ESFJ: { name: "合作協調者", line: "把現場的需求說清楚，替合作安排下一步。" },
  ISTP: { name: "實作解題者", line: "先摸清眼前條件，再用可逆嘗試找到解法。" },
  ISFP: { name: "體驗打磨者", line: "貼近真實使用的感受，在小步嘗試裡調整。" },
  ESTP: { name: "即刻實驗者", line: "一邊對話一邊試，讓現場證據決定下一手。" },
  ESFP: { name: "現場點子手", line: "接住當下的需求，用互動和嘗試帶來新選擇。" },
};
export type PersonaCode = TypeCode;
export const families = [
  { id: "codex", label: "Codex", model: "openai", color: "#a99aff" },
  { id: "claude", label: "Claude", model: "anthropic", color: "#df967c" },
  { id: "gemini", label: "Gemini", model: "google", color: "#83b9ff" },
  { id: "grok", label: "Grok", model: "xai", color: "#a7a7b4" },
  { id: "deepseek", label: "DeepSeek", model: "deepseek", color: "#67bfe2" },
  { id: "glm", label: "Z.ai / GLM", model: "zai", color: "#eda6d9" },
] as const;
export type Family = typeof families[number]["id"];
export type ArtStyle = "regular" | "chibi";
// Without a token-weighted model family, the most used client picks the theme it ships with.
const clientFamilies: Partial<Record<string, Family>> = { codex: "codex", "claude-code": "claude", antigravity: "gemini" };
export function defaultFamily(modelFamily: string, client?: string): Family {
  return families.find((f) => f.model === modelFamily)?.id ?? clientFamilies[client ?? ""] ?? "codex";
}
export const modelLabels: Record<string, string> = { openai: "OpenAI / GPT", anthropic: "Anthropic / Claude", google: "Google / Gemini", xai: "xAI / Grok", deepseek: "DeepSeek", zai: "Z.ai / GLM", other: "其他模型", unknown: "尚未確認" };
export const clientLabels: Record<string, string> = { codex: "Codex", "claude-code": "Claude Code", antigravity: "Antigravity", cursor: "Cursor", chatgpt: "ChatGPT", other: "其他工具", unknown: "尚未確認" };
export {artFor,artSlot,artCounts,displayArt} from "./art-catalog.ts";
export function artTitle(family:Family,locale:Locale="zh-TW") {
  const t=translator(locale);
  return family==="codex"?t("GPT 娘的 Codex 主題同人改編"):t("{family} 角色同人改編",{family:families.find(f=>f.id===family)!.label});
}
export function artCredit(family:Family,locale:Locale="zh-TW") {
  return translator(locale)("ApprenTice · 角色參考 ZipZipPipe{extra} · AI 輔助再創作",{extra:family==="deepseek"?"、上善無形":""});
}
export function personaFor(type: string | null) {
  return type && type in personas ? personas[type as TypeCode] : { name: "顯影中的搭檔", line: "有些方向還需要觀察，讓真實合作慢慢留下輪廓。" };
}
