import { signalNames, type Submission } from "./contract.ts";
import { deriveAssessment, toReport } from "./assessment.ts";
export function makeFixture(nickname = "示範旅人"): Submission {
  const signals = Object.fromEntries(signalNames.map((key) => [key, { status: "unknown", cases: [] }])) as unknown as Submission["signals"];
  for (const key of ["stableSingleTask", "preciseInstruction", "effectiveCorrection", "reusableArtifact", "testedBeforeUse", "repeatedUse", "handoffReady", "selfTestCases"] as const) signals[key] = { status: "observed", cases: ["E001", "E002"] };
  const data: Submission = {
    version: "1.0", kind: "fixture", nickname,
    consent: { localAnalysisApproved: true, aggregateUploadApproved: true },
    observedPeriod: { from: "2026-09-26", to: "2026-10-09" },
    coverage: { scope: "partial", sources: ["codex"], gaps: ["web_history_unavailable", "other_sources_missing"], sampledSessions: 18 },
    metrics: { humanSessions: 18, automatedSessions: 3, subagentSessions: 5, userMessages: 86, inputTokens: null, outputTokens: null, tokenSource: "unavailable", modelUsage: [{ family: "openai", count: 15 }, { family: "anthropic", count: 3 }], modelUsageUnit: "sessions", mostUsedModelFamily: "openai", mostUsedClient: "codex" },
    cases: [{ id: "E001", source: "codex", kind: "artifact_test" }, { id: "E002", source: "codex", kind: "reuse" }], signals,
    workflows: { independentWorkflows: 1, independentRuns: 2, sustainedDays: 5, cloudDependent: true, entrypoints: ["codex"] },
    axes: { preparation: { value: "P", cases: ["E001"] }, verification: { value: "V", cases: ["E001"] }, reuse: { value: "S", cases: ["E002"] }, execution: { value: "E", cases: ["E001", "E002"] } },
    assessment: { level: "LV4+", type: "PVSE" },
  };
  data.assessment = deriveAssessment(data);
  return data;
}
export const demoReport = toReport(makeFixture());
