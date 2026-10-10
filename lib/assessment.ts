import { submissionSchema, behaviorAxis, type Submission, type TypeCode } from "./contract.ts";
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
export function deriveAssessment(data: Submission): Submission["assessment"] {
  const pattern = inspectAxes(data).map((axis) => axis.value).join("");
  return { type: pattern.includes("?") ? null : pattern as TypeCode, pattern, status: pattern.includes("?") ? "incomplete" : "complete" };
}
export function validateSubmission(input: unknown, now = Date.now()) {
  const data = submissionSchema.parse(input);
  if (data.observedPeriod.to > new Date(now).toISOString().slice(0, 10)) throw new Error("Future observations are not valid");
  const calculated = deriveAssessment(data);
  if (data.assessment.type !== calculated.type || data.assessment.pattern !== calculated.pattern || data.assessment.status !== calculated.status) throw new Error("Assessment does not match supplied evidence");
  return data;
}
export function toReport(data: Submission) {
  return { ...data, assessment: deriveAssessment(data), axisFindings: inspectAxes(data), rubric: RUBRIC.id, caveat: "借用四組字母，以自訂規則描述合作風格，非官方 MBTI 評量。這是你帶領 Agent 工作的期間觀察，不是人的心理診斷或模型的固定性格。" };
}
export type Report = ReturnType<typeof toReport>;
export type CardObservation = Pick<Report, "nickname" | "kind" | "assessment"> & { modelFamily: Report["metrics"]["mostUsedModelFamily"] };
export function toCardObservation(report: Report): CardObservation {
  return { nickname: report.nickname, kind: report.kind, assessment: report.assessment, modelFamily: report.metrics.mostUsedModelFamily };
}
