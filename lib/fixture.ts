import type { Submission, Behavior } from "./contract.ts";
import { deriveAssessment, toReport } from "./assessment.ts";

export function makeFixture(nickname = "示範搭檔"): Submission {
  const tasks: Submission["tasks"] = [
    { id: "T001", date: "2026-10-01", source: "codex", context: "build" },
    { id: "T002", date: "2026-10-04", source: "codex", context: "research" },
    { id: "T003", date: "2026-10-09", source: "codex", context: "planning" },
  ];
  const behaviors: Behavior[] = ["consolidated_delivery", "pattern_exploration", "consistent_criteria", "early_commitment"];
  const data: Submission = {
    version: "2.0", kind: "fixture", nickname,
    consent: { localAnalysisApproved: true, aggregateUploadApproved: true },
    observedPeriod: { from: "2026-10-01", to: "2026-10-09" },
    coverage: { scope: "partial", sources: ["codex"], gaps: ["web_history_unavailable", "other_sources_missing", "no_tokscale"], sampledSessions: 9 },
    metrics: { humanSessions: 9, automatedSessions: 2, subagentSessions: 3, userMessages: 42, inputTokens: null, outputTokens: null, tokenSource: "unavailable", modelUsage: [{ family: "openai", count: 7 }, { family: "anthropic", count: 2 }], modelUsageUnit: "sessions", mostUsedModelFamily: "openai", mostUsedClient: "codex" },
    tasks,
    observations: tasks.flatMap((task, i) => behaviors.map((behavior, j) => ({ id: "O" + String(i * 4 + j + 1).padStart(3, "0"), task: task.id, behavior, ownerRequest: i === 1 ? "not_specified" : behavior, opportunity: "both_available" }))),
    assessment: { type: null, pattern: "????", status: "incomplete" },
  };
  data.assessment = deriveAssessment(data);
  return data;
}
export function makePartialFixture(nickname = "顯影中的搭檔"): Submission {
  const data = makeFixture(nickname);
  data.observations = data.observations.filter((o) => o.behavior !== "consistent_criteria");
  data.coverage.gaps.push("insufficient_records");
  data.assessment = deriveAssessment(data);
  return data;
}
export const demoReport = toReport(makeFixture());
