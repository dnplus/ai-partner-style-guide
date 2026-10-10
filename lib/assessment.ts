import { submissionSchema, behaviorAxis, type Submission, type TypeCode } from "./contract.ts";
import {deriveUsageLevel, type UsageLevel} from "./usage-level.ts";
import { RUBRIC, axisDefinitions, behaviorLetters } from "./workstyle.ts";

export function inspectAxes(data: Submission) {
  return axisDefinitions.map((axis) => {
    const groups = new Map<string, Set<string>>();
    const excludedTasks = new Set<string>();
    const sourceByTask = new Map(data.tasks.map((t) => [t.id, t.source]));
    for (const o of data.observations.filter((o) => behaviorAxis[o.behavior] === axis.id)) {
      const ownerMismatch = o.ownerRequest !== "not_specified" && o.ownerRequest !== "unknown" && o.ownerRequest !== o.behavior;
      if (o.opportunity !== "both_available" || ownerMismatch || sourceByTask.get(o.task) === "unknown") { excludedTasks.add(o.task); continue; }
      const choices = groups.get(o.task) ?? new Set<string>();
      choices.add(behaviorLetters[o.behavior]); groups.set(o.task, choices);
    }
    const leftTasks: string[] = [], rightTasks: string[] = [], mixedTasks: string[] = [];
    for (const [task, letters] of groups) {
      if (letters.size > 1) mixedTasks.push(task);
      else if (letters.has(axis.left)) leftTasks.push(task);
      else rightTasks.push(task);
    }
    const eligibleTasks = groups.size;
    const winner = Math.max(leftTasks.length, rightTasks.length);
    const sufficient = data.coverage.scope !== "insufficient" && eligibleTasks >= RUBRIC.minimumTasks;
    const clear = sufficient && winner >= RUBRIC.minimumTasks && winner * RUBRIC.supportDenominator >= eligibleTasks * RUBRIC.supportNumerator && Math.abs(leftTasks.length - rightTasks.length) >= RUBRIC.minimumMargin;
    return { axis: axis.id, value: clear ? (leftTasks.length > rightTasks.length ? axis.left : axis.right) : "?", reason: !sufficient ? "insufficient" : clear ? "leaning" : "near_boundary", eligibleTasks, leftTasks, rightTasks, mixedTasks, excludedTasks: [...excludedTasks] };
  });
}
export function deriveAssessment(data: Submission): NonNullable<Submission["assessment"]> {
  const pattern = inspectAxes(data).map((axis) => axis.value).join("");
  return { type: pattern.includes("?") ? null : pattern as TypeCode, pattern, status: pattern.includes("?") ? "incomplete" : "complete" };
}
export function validateSubmission(input: unknown, now = Date.now()) {
  const data = submissionSchema.parse(input);
  if (data.observedPeriod.to > new Date(now+14*60*60*1000).toISOString().slice(0, 10)) throw new Error("Future observations are not valid");
  return data;
}
export function toReport(data: Submission) {
  return { ...data, usageLevel: deriveUsageLevel(data), assessment: deriveAssessment(data), axisFindings: inspectAxes(data), rubric: RUBRIC.id, caveat: "借用四組字母，以自訂規則描述合作風格，非官方 MBTI 評量。這是你帶領 Agent 工作的期間觀察，不是人的心理診斷或模型的固定性格。" };
}
export type Report = ReturnType<typeof toReport>;
export type CardObservation = Pick<Report, "nickname" | "kind" | "assessment"> & { modelFamily: Report["metrics"]["mostUsedModelFamily"]; usageLevel:UsageLevel; brief:string[] };
export function toCardObservation(report: Report): CardObservation {
  return { nickname: report.nickname, kind: report.kind, assessment: report.assessment, modelFamily: report.metrics.mostUsedModelFamily, usageLevel: deriveUsageLevel(report), brief: briefFor(report.assessment.pattern) };
}

const observedLines:Record<string,string>={E:"資訊足夠時，仍常透過來回共創推進成果。",I:"資訊足夠時，傾向整理完成再交付整合結果。",S:"理解新問題時，常從具體實例與現況起步。",N:"理解新問題時，常從模式與不同可能起步。",T:"方案取捨時，偏向讓一致準則決定方向。",F:"方案取捨時，偏向先考量受影響者的處境。",J:"路線可選時，偏向先約定方向與里程碑。",P:"路線可選時，偏向用可逆實驗逐步收斂。"};
export function briefFor(pattern:string){
 const known=[...pattern].filter(letter=>letter!=="?");
 const lines=known.slice(0,2).map(letter=>observedLines[letter]);
 if(lines.length<2)lines.push("其餘合作偏好仍需要更多獨立任務的線索。");
 if(!known.length)lines.unshift("目前還沒有足夠線索辨認合作偏好。");
 return lines.slice(0,2);
}
