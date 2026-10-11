import type { Submission } from "./contract.ts";
import { toReport } from "./assessment.ts";

export function makeFixture(nickname = "示範搭檔"): Submission {
  const axes = { EI: "I", SN: "N", TF: "T", JP: "J" } as const;
  return {
    version: "3.0", kind: "fixture", nickname,
    consent: { localAnalysisApproved: true, aggregateUploadApproved: true },
    observedPeriod: { from: "2026-10-01", to: "2026-10-09" },
    coverage: { scope: "partial", sources: ["codex"], gaps: ["web_history_unavailable", "other_sources_missing", "no_tokscale"], sampledSessions: 9 },
    metrics: { humanSessions: 9, automatedSessions: 2, subagentSessions: 3, userMessages: 42, inputTokens: null, outputTokens: null, tokenSource: "unavailable", modelUsage: [{ family: "openai", count: 7 }, { family: "anthropic", count: 2 }], modelUsageUnit: "sessions", mostUsedModelFamily: "openai", mostUsedClient: "codex" },
    tasks: [
      { id: "T001", date: "2026-10-01", source: "codex", context: "build", axes },
      { id: "T002", date: "2026-10-04", source: "codex", context: "research", axes },
      { id: "T003", date: "2026-10-09", source: "codex", context: "planning", axes },
    ],
  };
}
export function makePartialFixture(nickname = "顯影中的搭檔"): Submission {
  const data = makeFixture(nickname);
  data.tasks = data.tasks.map((t) => ({ ...t, axes: { ...t.axes, TF: "unclear" } }));
  data.coverage.gaps.push("insufficient_records");
  return data;
}
export function makeLevelFixture(nickname="示範搭檔"):Submission { const data=makeFixture(nickname);data.usageEvidence={version:"usage-level-v2",observations:[{task:"T001",signal:"useful_result_verified"},{task:"T002",signal:"useful_result_verified"}]};data.systemEvidence={automationSessions:2,subagentSessions:5,automationSpanDays:9,assetWriteSessions:1,assetReuseSessions:2,assetMaintainedAfterAutomation:1,gearKinds:1,filesScanned:40,filesListed:40};return data;}
export const demoReport = toReport(makeLevelFixture());
