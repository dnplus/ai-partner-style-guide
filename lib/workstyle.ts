export const RUBRIC = { id: "agent-workstyle-v2", minimumPicks: 3, minimumMargin: 2, clearNumerator: 2, clearDenominator: 3 } as const;
export const axisDefinitions = [
  { id: "EI", name: "思考方式", left: "E", right: "I", prompt: "下次留意：你是先想清楚再交代，還是邊聊邊把想法理清？" },
  { id: "SN", name: "指令焦點", left: "S", right: "N", prompt: "下次留意：你給的是具體做法，還是目標和方向？" },
  { id: "TF", name: "驗收依據", left: "T", right: "F", prompt: "下次留意：你驗收時，看的是證據還是感受？" },
  { id: "JP", name: "工作框架", left: "J", right: "P", prompt: "下次留意：這件事你當成固定流程，還是一次性的探索？" },
] as const;
export const letterLabels: Record<string, string> = { E: "邊聊邊想", I: "想好再說", S: "給做法", N: "給方向", T: "看證據", F: "看感受", J: "有章法", P: "隨手試", "?": "還沒定向" };
export const letterTips: Record<string, string> = {
  E: "你習慣在對話裡把想法聊清楚。試著把聊出來的結論寫進開場，下次省下來回。", I: "你習慣想好再交代。遇到長任務，留一個中途檢查點，讓它有機會提醒你沒想到的地方。",
  S: "你給得很具體。偶爾只給目標，看看它會不會找到更好的路。", N: "你給方向就放手。關鍵處補一個範例或限制，結果會更貼近。",
  T: "你用證據驗收。別忘了問一句：用的人感覺如何？", F: "你用感受驗收。補一條能檢查的底線，品味更不會走樣。",
  J: "你愛把事情做成流程。偶爾留一段時間盒，自由試試。", P: "你邊試邊調。好用的做法，記得收成能重用的技能或腳本。",
};
export const contextLabels: Record<string, string> = { research: "研究", build: "製作", writing: "寫作", planning: "規劃", support: "協助", other: "其他" };
