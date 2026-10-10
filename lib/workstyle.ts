import type { Behavior } from "./contract.ts";

export const RUBRIC = { id: "agent-workstyle-v1", minimumTasks: 3, minimumMargin: 2, supportNumerator: 2, supportDenominator: 3 } as const;
export const axisDefinitions = [
  { id: "EI", name: "互動節奏", left: "E", right: "I", prompt: "下一次資訊齊全、可自行處理的任務，觀察它選擇途中共創，還是整理後一起回報。" },
  { id: "SN", name: "理解起點", left: "S", right: "N", prompt: "下一次開放的新問題，觀察它先從具體實例展開，還是先連結模式與不同可能。" },
  { id: "TF", name: "取捨依據", left: "T", right: "F", prompt: "下一次兩個合理方案有取捨時，觀察一致的比較準則與受影響者的處境，哪個先決定方向。" },
  { id: "JP", name: "推進方式", left: "J", right: "P", prompt: "下一次路線尚未確定、又不受固定流程限制時，觀察它先定里程碑，還是先做可逆實驗。" },
] as const;
export const behaviorLetters: Record<Behavior, string> = { collaborative_iteration: "E", consolidated_delivery: "I", concrete_evidence: "S", pattern_exploration: "N", consistent_criteria: "T", people_context: "F", early_commitment: "J", reversible_experiments: "P" };
export const letterLabels: Record<string, string> = { E: "互動共創", I: "整理後交付", S: "具體起步", N: "可能性起步", T: "準則取捨", F: "情境取捨", J: "路線先行", P: "試探收斂", "?": "還沒定向" };
export const letterTips: Record<string, string> = {
  E: "給它中途可以對焦的節點，讓來回討論推進成果。", I: "先說清楚目標與回報時機，留一段可以整理成形的空間。",
  S: "附上一個真實範例和限制，讓它有具體起點。", N: "先交代想達成的改變，再讓它提出幾條不同路線。",
  T: "事先寫下取捨標準，並補上標準容易漏掉的人。", F: "說明誰會受影響、在乎什麼，也一起約定能檢查的底線。",
  J: "約好路線與里程碑，也明訂什麼新證據值得改道。", P: "給探索一個時間盒，約定何時把實驗收斂成決定。",
};
export const contextLabels: Record<string, string> = { research: "研究", build: "製作", writing: "寫作", planning: "規劃", support: "協助", other: "其他" };
