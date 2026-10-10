# C4 · 一次授權後自動揭曉

本次修正接續 C3 的「你的 Agent MBTI」，沒有讀取真人會話。唯一 AGY 回歸資料是 fixtures/agy-control-flow.json 的虛構控制流程；沒有複製試用逐字紀錄、舊權杖或舊分型結論。

## 已完成

指令先用一小段確認本人來源、起迄日期、確切網站／會話／到期時間與允許傳送的最小欄位。取得同意後，在同一範圍內自動分析、驗證並提交。保留可讀指令，不再要求第二次巨大 JSON 確認，不在終端搶先列出分型或完整報告。主機讀取、指令及網路的必要核准仍由原生流程處理，沒有繞過權限。

lib/collector-runner.ts 檢查 grant 與目的地／會話／暱稱／日期／來源的一致性，重新計算分型，最多三次原 JSON、原 key 重試。不含私人紀錄掃描器；真實 Agent 仍依協定選取已授權來源。主機待核准只接受明確的 HostApprovalRequired 訊號，通用 403 不推定原因。

POST /api/collect/{id}/status 僅接受序號、階段與核准種類。寫入權杖不能讀報告，讀取權杖不能寫進度。事件順序單調；原事件重試不刷新時間，階段不延長 TTL，只有摘要實際寫入才產生 complete。D1 migration 0002 增加四個進度欄位，已僅套用此工作區的本機資料庫。

等待頁區分沒有訊號、最後回報階段、實際待主機核准、90 秒無新階段、網站自己的收件服務連線失敗。到期後「沿用分析，換新連結」保留暱稱；Agent 保留的最小摘要可重用，但新目的地必須得到新授權。沒有默默續期或重掃。

示範從一段範圍說明與一次同意直接走自動校驗、HTTP 提交與網站揭曉。不填 Email 只取得卡片；填寫並同意結果用途才從後端取得完整報告。本機沒有寄信，也沒有宣稱寄出。

## 精確驗證

- npm run typecheck：成功。
- npm test：47／47，包含範圍越界、遺失已接受的回應、原 key 重試、到期保留摘要、新目的地未授權拒絕、明確授權後送達、階段順序與權限、到期清理、Email gate。
- npm run test:browser：8／8，開發伺服器及最終建置 Worker 均跑過。涵蓋桌面、390 × 844 手機觸控、reduced-motion、未知結果、單次範圍同意、自動揭曉、實際狀態 callback、待主機核准、90 秒無訊號、重新連線、到期換連結、PNG。
- node /Users/dnplus/.codex/plugins/cache/openai-curated-remote/sites/1.0.0/scripts/build-site.mjs：成功。
- node scripts/smoke-built.mjs http://127.0.0.1:5188：20／20 個建置後 HTTP 檢查，專用範例會話於 finally 刪除。
- 可見 Chrome 另手動走過示範，確認一次同意後直接揭曉，沒有第二道確認。

證據位於 evidence/agent-mbti-flow/。single-scope-consent.png、host-approval-pending.png、stale-signal.png、expired.png、agy-sanitized-report.png、mobile-collection.png 為實際網頁截圖。card-nickname.png 為 1080 × 1620 實際下載檔。主機待核准測試以有限狀態 fixture 表示，不代表此機真有未處理的權限要求；過期 UI 使用可控瀏覽器時鐘，實際 API 效期在本機 D1 測試以注入時鐘驗證。

## 下一個已授權階段與限制

192 張插畫是獨立的 C5 接入工作。已收到並在 Air 核對 157 個唯一 Library 圖片與 SHA-256，另外 35 張正在其他工作產生。本 C4 畫面仍是 C3 的 12 張中性造型；不可因此宣稱 192 圖完整，也不可用 fallback 填滿。選圖清單與素材暫放同工作區的 ../art-incoming，沒有放進此流程提交。

未讀私人紀錄、未將 raw log／code／path／secret 傳至網站、未新增登入或憑證、未寄信、未公開部署、未 push／merge。外部私人 Sites callback 尚未驗證；loopback callback 成功只證明本機。Email 寄送、真人證據校準、動畫匯出與完整插畫矩陣尚未完成。

C1–C3 receipt 的 STALE 來自後續已授權功能變更，保留歷史，不重寫舊驗收。C4 單獨封存；原始測試／建置 log 保留，不以其尾端空行充當程式碼格式問題。
