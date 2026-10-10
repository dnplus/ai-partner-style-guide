import { z } from "zod";

export const receivedProgressSchema = z.object({
  phase:z.enum(["not_connected","analyzing","validating","awaiting_host_approval","submitting","paused","complete"]),
  sequence:z.number().int().min(0), updatedAt:z.number().nullable(),
  approvalKind:z.enum(["local_read","network","command"]).nullable(),
}).strict();
export type ReceivedProgress = z.infer<typeof receivedProgressSchema>;
export const emptyProgress:ReceivedProgress = {phase:"not_connected",sequence:0,updatedAt:null,approvalKind:null};
export const STALE_AFTER_MS = 90_000;
export function describeProgress(progress:ReceivedProgress,now:number) {
  const labels = {not_connected:"還沒與 Agent 連上",analyzing:"Agent 正在整理授權範圍",validating:"Agent 正在檢查摘要",awaiting_host_approval:"Agent 回報需要主機核准",submitting:"Agent 正在傳送摘要",paused:"Agent 已暫停",complete:"摘要已送達"};
  const stale=progress.updatedAt!==null && now-progress.updatedAt>STALE_AFTER_MS && progress.phase!=="complete";
  const approval={local_read:"讀取本機資料",network:"連線",command:"執行指令"};
  const details=progress.phase==="not_connected"
    ? "把指令交給同一台電腦上的 Agent，完成一次來源、期間與摘要傳送授權。尚未收到狀態，不代表它沒有開始。"
    : stale
    ? "已超過 90 秒沒有新的階段訊號；可能仍在處理，也可能已中斷。請回 Agent 查看實際狀況。"
    : progress.phase==="awaiting_host_approval"
    ? "請回 Agent 查看「"+approval[progress.approvalKind ?? "command"]+"」的原生核准提示。核准後可繼續；若不核准，分析會停在該處。"
    : progress.phase==="paused"
    ? "請回 Agent 看它回報的原因。網站沒有收到更詳細的內容。"
    : "收到摘要後，這裡會自動揭曉。不需要再確認一次 JSON。";
  return {title:stale ? "暫時沒有新的進度" : labels[progress.phase],details,stale,lastPhase:labels[progress.phase]};
}
