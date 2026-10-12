import { submissionSchema, typeCodes, type Assessment, type AxisResult, type Submission, type TypeCode } from "./contract.ts";
import {deriveUsageLevel, type UsageLevel} from "./usage-level.ts";
import { RUBRIC, axisDefinitions } from "./workstyle.ts";

export function deriveAssessment(data: Submission): Assessment {
  const tasks = data.coverage.scope === "insufficient" ? [] : data.tasks.filter((t) => t.source !== "unknown");
  const axes = axisDefinitions.map(({ id, left, right }): AxisResult => {
    const leftPicks = tasks.filter((t) => t.axes[id] === left).length, rightPicks = tasks.filter((t) => t.axes[id] === right).length;
    const total = leftPicks + rightPicks, winner = Math.max(leftPicks, rightPicks);
    if (total < RUBRIC.minimumPicks || leftPicks === rightPicks) return { axis: id, value: "?", strength: null };
    const clear = winner * RUBRIC.clearDenominator >= total * RUBRIC.clearNumerator && Math.abs(leftPicks - rightPicks) >= RUBRIC.minimumMargin;
    return { axis: id, value: leftPicks > rightPicks ? left : right, strength: clear ? "clear" : "lean" };
  });
  const pattern = axes.map((axis) => axis.value).join("");
  const type = typeCodes.find((code) => code === pattern) ?? null;
  return { type, pattern, status: type ? "complete" : "incomplete", axes };
}
export function decidedAssessment(type: TypeCode): Assessment {
  return { type, pattern: type, status: "complete", axes: axisDefinitions.map(({ id, left, right }, i) => ({ axis: id, value: type[i] === left ? left : right, strength: "clear" })) };
}
export function validateSubmission(input: unknown, now = Date.now()) {
  const data = submissionSchema.parse(input);
  if (data.observedPeriod.to > new Date(now+14*60*60*1000).toISOString().slice(0, 10)) throw new Error("Future observations are not valid");
  return data;
}
export function toReport(data: Submission) {
  return { ...data, usageLevel: deriveUsageLevel(data), assessment: deriveAssessment(data), rubric: RUBRIC.id, caveat: "借用四組字母，以自訂規則描述你帶 Agent 的方式，非官方 MBTI 評量。這是這段期間的帶法觀察，不是心理診斷，也不是模型的固定性格。" };
}
export type Report = ReturnType<typeof toReport>;
export type CardObservation = Pick<Report, "nickname" | "kind" | "assessment"> & { modelFamily: Report["metrics"]["mostUsedModelFamily"]; usageLevel:UsageLevel; brief:string[]; selfType:TypeCode|null };
export function toCardObservation(report: Report, selfType: TypeCode | null = null): CardObservation {
  return { nickname: report.nickname, kind: report.kind, assessment: report.assessment, modelFamily: report.metrics.mostUsedModelFamily, usageLevel: deriveUsageLevel(report), brief: briefFor(report.assessment), selfType };
}
export const storedSelfType = (value: string | null): TypeCode | null => typeCodes.find((code) => code === value) ?? null;

export const observedLines:Record<string,string>={E:"你常在途中看結果、改方向，邊做邊帶它。",I:"你習慣開場就把目標講清楚，之後很少插手。",S:"你給的多是具體做法：檔案、步驟、指令、範例。",N:"你多半給目標和方向，路線交給它自己找。",T:"你驗收時看證據：測試、數字、規格、差異。",F:"你驗收時看感受：語氣、品味、用的人舒不舒服。",J:"你把工作當成有章法的事：先排計畫，留下能重用的流程。",P:"你把工作當成探索：邊試邊調，用完就走。"};
export function briefFor(assessment:Assessment){
 const known=assessment.axes.filter(axis=>axis.value!=="?").sort((a,b)=>Number(a.strength==="lean")-Number(b.strength==="lean"));
 const lines=known.slice(0,2).map(axis=>observedLines[axis.value]);
 if(lines.length<2)lines.push("其餘合作偏好仍需要更多獨立任務的線索。");
 if(!known.length)lines.unshift("目前還沒有足夠線索辨認合作偏好。");
 return lines.slice(0,2);
}
