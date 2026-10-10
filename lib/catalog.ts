export const personas = {
  PVSE: { name: "系統建築師", line: "把一次做對，變成下一次也做得對。" },
  PVSC: { name: "流程設計者", line: "為想法畫好路線，讓每一步都有依據。" },
  PVOE: { name: "精準特工", line: "任務清楚，驗收確實，每次出手都到位。" },
  PVOC: { name: "求證派", line: "給問題脈絡，也給答案一次查核。" },
  PASE: { name: "自動化狂人", line: "把清楚的想法接上自動執行的開關。" },
  PASC: { name: "交辦型主管", line: "整理好要求，信任 AI 接下下一棒。" },
  PAOE: { name: "效率外包客", line: "目標說清楚，把時間留給下一件事。" },
  PAOC: { name: "需求規格官", line: "先把需求想透，再用對話整理成形。" },
  QVSE: { name: "邊做邊修的工程腦", line: "邊探索、邊驗證，把走過的路留下來。" },
  QVSC: { name: "好奇查證家", line: "讓每個好問題，長成可回看的知識。" },
  QVOE: { name: "直覺實驗家", line: "想到就試，用真實結果回答好奇心。" },
  QVOC: { name: "抬槓辯論家", line: "在來回追問中，把自己的想法磨清楚。" },
  QASE: { name: "一把梭", line: "讓靈感迅速開跑，再留下可用的方法。" },
  QASC: { name: "靈感速記員", line: "接住一閃而過的念頭，累積你的素材庫。" },
  QAOE: { name: "許願池", line: "先拋出一個可能，再看看它會長成什麼。" },
  QAOC: { name: "閒聊夥伴", line: "在日常對話裡，打開新的想法。" },
} as const;
export type PersonaCode = keyof typeof personas;
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
export const modelLabels: Record<string, string> = { openai: "OpenAI / GPT", anthropic: "Anthropic / Claude", google: "Google / Gemini", xai: "xAI / Grok", deepseek: "DeepSeek", zai: "Z.ai / GLM", other: "其他模型", unknown: "尚未確認" };
export const clientLabels: Record<string, string> = { codex: "Codex", "claude-code": "Claude Code", antigravity: "Antigravity", cursor: "Cursor", chatgpt: "ChatGPT", other: "其他工具", unknown: "尚未確認" };
export const levelLabels: Record<string, string> = { unknown: "無法定級", LV0: "問答探索", LV1: "迭代提問", LV2: "單點式應用", LV3: "精準下指令", LV4: "模組實踐者", "LV4+": "系統架構者", LV5: "系統級營運" };
export const axisLabels: Record<string, string> = { P: "給足脈絡", Q: "探索起步", V: "動手驗證", A: "直接採用", S: "固化資產", O: "一次性使用", E: "讓 AI 執行", C: "以對話思考", "?": "資料不足" };
export function artFor(family: Family, type: string, style: ArtStyle) {
  return type === "PVSE" ? `/art/${family}-pvse-${style}.png` : null;
}
export function artTitle(family: Family) {
  return family === "codex" ? "GPT 娘的 Codex 主題同人改編" : `${families.find(f => f.id === family)!.label} 角色同人改編`;
}
export function artCredit(family: Family) {
  return `ApprenTice · 角色參考 ZipZipPipe${family === "deepseek" ? "、上善無形" : ""} · AI 輔助再創作`;
}
export function personaFor(type: string) {
  return personas[type as PersonaCode] ?? { name: "仍在顯影的風格", line: "保留未知，等更多真實證據讓輪廓清晰。" };
}
