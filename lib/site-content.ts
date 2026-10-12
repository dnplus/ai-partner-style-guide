import {translator,locales,type Locale} from './i18n.ts';

// Answer-first copy for the public pages, the FAQ schema and llms.txt, kept in one place so they never drift apart.
export const faq=[
 ['這是官方 MBTI 嗎？','不是。只借用四組字母與 16 個代碼的命名，用本專案自訂的規則描述你帶 Agent 的方式；不是心理測驗，也不推斷人格。MBTI 是 The Myers-Briggs Company 的註冊商標，本站與其無關。'],
 ['怎麼判斷我的類型？','你的 Agent 用 collect.py 在本機抽樣最近 60 天的對話，每段對話只看你說了什麼，四軸各選一邊。伺服器統計後，至少 3 票且多數勝出才給字母，差距小時標成傾向。'],
 ['會上傳我的對話嗎？','不會。只上傳暱稱、日期、來源、用量彙總和每段對話的四軸判斷；對話原文、程式碼與檔案路徑都留在你的電腦。'],
 ['使用等級怎麼算？','LV0–3 看你如何查核與修正 Agent 的結果；LV4–5 看你寫下的技能、規則或腳本是否被其他工作階段重用，以及自動化是否穩定運作兩週以上。沒有證據時保持未知。'],
 ['需要哪些工具？','一個能執行指令的 Agent，例如 Claude Code、Codex 或 Cursor。支援讀取 Claude Code、Codex、Cursor、OpenCode、Hermes 等本機紀錄，並用 Tokscale 彙總 token。'],
 ['結果可以拿來評估員工或應徵者嗎？','不建議。結果由本人電腦計算，網站無法驗證原始紀錄，四軸也不代表能力；適合拿來聊聊彼此怎麼用 AI。'],
] as const;
export const steps=['替你的 Agent 命名，建立專屬連結。','把指令交給你的 Agent，它在本機分析並送回最小摘要。','揭曉角色卡、使用等級與下一步建議。'] as const;
export const limits=['結果由本人的 Agent 在本機計算，網站只檢查摘要的一致性，無法檢視原始紀錄。','判讀由語言模型完成；換模型時，接近平手的軸可能翻轉。','涵蓋範圍取決於本機有哪些紀錄，網頁版對話不在其中。'] as const;
export const infoPaths=['/types','/levels','/method'] as const;
export const localeFor=(value:string|string[]|undefined):Locale=>locales.find(l=>l===value)??'zh-TW';
export const localized=(path:string,locale:Locale)=>locale==='zh-TW'?path:path+(path.includes('?')?'&':'?')+'lang='+locale;
export function siteDescription(locale:Locale){return translator(locale)('用你本機的 Agent 對話紀錄，看你帶 Agent 的方式屬於 16 型中的哪一型，並得到 LV0–5 使用等級與角色卡。非官方 MBTI 評量。');}
