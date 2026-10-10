import { submissionSchema, type Submission, type Level } from "./contract.ts";

export const FRAMEWORK = { name: "ai-level-check", version: "0.4.6", commit: "d262ca67a6efa59ffb0e0a2a2843978a149e047d", license: "MIT" };
export function deriveAssessment(data: Submission) {
  const s = data.signals;
  const observed = (name: keyof typeof s, minCases = 1) => s[name].status === "observed" && s[name].cases.length >= minCases;
  const type = [data.axes.preparation, data.axes.verification, data.axes.reuse, data.axes.execution].map((a) => a.value).join("");
  let level: Level = "unknown";
  if (data.coverage.scope !== "insufficient" && data.cases.length > 0) {
    if (observed("unsafeAdoption")) level = "LV0";
    if (observed("iterativeRetry")) level = "LV1";
    if (observed("stableSingleTask", 2)) level = "LV2";
    if (observed("preciseInstruction", 2) && observed("effectiveCorrection")) level = "LV3";
    const reusable = observed("reusableArtifact") && observed("testedBeforeUse") && observed("repeatedUse", 2) && observed("handoffReady");
    if (reusable) level = observed("selfTestCases") ? "LV4+" : "LV4";
    const w = data.workflows;
    const habitat = w.cloudDependent === false || (w.cloudDependent === true && new Set(w.entrypoints.filter((c) => c !== "unknown")).size >= 2 && observed("sharedRulesActualUse", 2));
    if (reusable && (w.independentWorkflows ?? 0) >= 2 && (w.independentRuns ?? 0) >= 3 && (w.sustainedDays ?? 0) >= 7 && observed("rolesAndCriteria") && observed("exceptionHandling") && observed("maintenanceFeedback") && habitat) level = "LV5";
  }
  return { level, type };
}
export function validateSubmission(input: unknown, now = Date.now()) {
  const data = submissionSchema.parse(input);
  if (data.observedPeriod.to > new Date(now).toISOString().slice(0, 10)) throw new Error("Future observations are not valid");
  const calculated = deriveAssessment(data);
  if (data.assessment.level !== calculated.level || data.assessment.type !== calculated.type) throw new Error("Assessment does not match supplied evidence");
  return data;
}
export function toReport(data: Submission) {
  return { ...data, assessment: deriveAssessment(data), framework: FRAMEWORK, caveat: "分型是風格，不是分數。未觀察到不等於不會；這份報告不是心理測驗。" };
}
export type Report = ReturnType<typeof toReport>;
export type CardObservation = Pick<Report, "nickname" | "kind" | "assessment"> & { modelFamily: Report["metrics"]["mostUsedModelFamily"] };
export function toCardObservation(report: Report): CardObservation {
  return { nickname: report.nickname, kind: report.kind, assessment: report.assessment, modelFamily: report.metrics.mostUsedModelFamily };
}
