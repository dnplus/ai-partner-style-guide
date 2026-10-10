import {z} from 'zod';
import type {Submission} from './contract.ts';
export const usageSignals=['unchecked_adoption','retry_after_error','useful_result_verified','context_scoped','acceptance_defined','targeted_correction_verified','artifact_inspected','artifact_tested','artifact_reused','workflow_operated','roles_defined','exceptions_handled','maintenance_verified','feedback_integrated'] as const;
export const usageEvidenceSchema=z.object({version:z.literal('usage-level-v1'),observations:z.array(z.object({task:z.string().regex(/^T(00[1-9]|01[0-9]|02[0-4])$/),signal:z.enum(usageSignals),artifact:z.string().regex(/^A(0[1-9]|1[0-2])$/).optional(),workflow:z.string().regex(/^W0[1-8]$/).optional()}).strict()).max(64)}).strict();
export const usageLevelSchema=z.object({version:z.literal('usage-level-v1'),value:z.number().int().min(0).max(5).nullable(),basis:z.enum(['unchecked_adoption','retry_after_error','verified_results','scoped_correction','tested_reuse','sustained_workflows']).nullable()}).strict();
export type UsageLevel=z.infer<typeof usageLevelSchema>;
export const levelNames=['直接採用','試探修正','穩定交付','精準協作','重用實作','維運系統'] as const;
export const levelDescriptions={unchecked_adoption:'曾在需要查核時直接採用答案。',retry_after_error:'已看到辨認錯誤後重新嘗試。',verified_results:'已在多個任務確認成果可用。',scoped_correction:'已看到清楚界定任務並完成具體修正。',tested_reuse:'已看到成果經測試，並在不同任務重用。',sustained_workflows:'已看到多條獨立工作流程持續運作與維護。'} as const;
export function deriveUsageLevel(data:Pick<Submission,'tasks'|'coverage'|'usageEvidence'>):UsageLevel{
 const result=(value:UsageLevel['value'],basis:UsageLevel['basis']):UsageLevel=>({version:'usage-level-v1',value,basis});
 if(data.coverage.scope==='insufficient'||!data.usageEvidence)return result(null,null);
 const taskMap=new Map(data.tasks.filter(t=>t.source!=='unknown').map(t=>[t.id,t]));
 const rows=data.usageEvidence.observations.filter(o=>taskMap.has(o.task));
 const tasks=(signal:string)=>new Set(rows.filter(o=>o.signal===signal).map(o=>o.task));
 const has=(signal:string)=>tasks(signal).size>0;
 const joined=(signals:string[])=>[...taskMap.keys()].some(task=>signals.every(signal=>rows.some(o=>o.task===task&&o.signal===signal)));
 const tested=[...new Set(rows.flatMap(o=>o.artifact?[o.artifact]:[]))].filter(artifact=>{
  const a=rows.filter(o=>o.artifact===artifact),inspected=a.filter(o=>o.signal==='artifact_inspected'),tested=a.filter(o=>o.signal==='artifact_tested'),reused=a.filter(o=>o.signal==='artifact_reused');
  return inspected.some(i=>tested.some(t=>reused.some(r=>r.task!==i.task&&r.task!==t.task&&taskMap.get(i.task)!.date<=taskMap.get(t.task)!.date&&taskMap.get(t.task)!.date<=taskMap.get(r.task)!.date)));
 });
 if(tested.length){
  const sustained=[...new Set(rows.flatMap(o=>o.workflow?[o.workflow]:[]))].map(workflow=>{
   const w=rows.filter(o=>o.workflow===workflow),operations=w.filter(o=>o.signal==='workflow_operated'),ids=new Set(operations.map(o=>o.task));
   const dates=[...ids].map(id=>taskMap.get(id)!.date).sort(),span=dates.length?Date.parse(dates.at(-1)!)-Date.parse(dates[0]):0;
   const complete=['roles_defined','acceptance_defined','exceptions_handled','maintenance_verified','feedback_integrated'].every(signal=>w.some(o=>o.signal===signal));
   const maintained=w.some(o=>o.signal==='maintenance_verified'&&taskMap.get(o.task)!.date>dates[0]);
   return {ids,ok:ids.size>=3&&span>=14*86400000&&complete&&maintained};
  }).filter(w=>w.ok);
  if(sustained.some((a,i)=>sustained.some((b,j)=>j>i&&![...a.ids].some(id=>b.ids.has(id)))))return result(5,'sustained_workflows');
  return result(4,'tested_reuse');
 }
 if(joined(['context_scoped','acceptance_defined','targeted_correction_verified']))return result(3,'scoped_correction');
 if(tasks('useful_result_verified').size>=2)return result(2,'verified_results');
 if(has('retry_after_error'))return result(1,'retry_after_error');
 if(has('unchecked_adoption'))return result(0,'unchecked_adoption');
 return result(null,null);
}
