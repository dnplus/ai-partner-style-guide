import type {Report} from './assessment.ts';

// Counts the collector computed itself, without any agent judgement. The report and the team board show the same set.
export type ObjectiveStats={
 sessions:number|null;inputTokens:number|null;outputTokens:number|null;automation:number|null;subagents:number|null;
 assetWrites:number|null;assetReuse:number|null;automationDays:number|null;judged:number;read:number|null;
 // The system pass can stop on its time budget; its counts are then lower bounds.
 partial:boolean;
};
export function objectiveStats(report:Pick<Report,'metrics'|'systemEvidence'|'tasks'|'coverage'>):ObjectiveStats{
 const system=report.systemEvidence;
 return {
  sessions:system?.filesListed??null,inputTokens:report.metrics.inputTokens,outputTokens:report.metrics.outputTokens,
  automation:system?.automationSessions??null,subagents:system?.subagentSessions??null,assetWrites:system?.assetWriteSessions??null,
  assetReuse:system?.assetReuseSessions??null,automationDays:system?.automationSpanDays??null,judged:report.tasks.length,read:report.coverage.sampledSessions,
  partial:system?.filesScanned!=null&&system.filesListed!=null&&system.filesScanned<system.filesListed,
 };
}
export function compactNumber(value:number,locale:string){
 return new Intl.NumberFormat(locale,{notation:value>=10000?'compact':'standard',maximumFractionDigits:1}).format(value);
}
