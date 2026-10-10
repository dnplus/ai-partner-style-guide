# C3 交付：你的 Agent MBTI

本版完成原創工作風格規則、協定、前台、報告與資料遷移；不是把舊字母換成新字母。專案獨立於 Agent House 與 genioone-private，沒有修改它們。

本機預覽：http://127.0.0.1:5188
工作目錄：/Users/dnplus/Documents/Codex/2026-10-10/task-2/ai-usage-card

## 使用路徑

首頁開始 → 替 Agent 命名 → 可選 Email 與結果用途同意 → 建立 30 分鐘專屬連結 → 複製 collector 指令 → 授權本機分析 → 預覽摘要、再同意提交 → 揭曉 → 完整觀察或只領卡片 → 任意主題／一般與 Q 版 → PNG。

Email 必須填寫且同意用途才取得完整報告；沒有 Email，伺服器只回傳卡片欄位。畫面清楚標示寄送尚未開放，沒有寄出信。範例入口在頁尾說明裡，範例照樣需預覽與確認。所有測試均為虛構資料。

## 主要實作

| 檔案／函式 | 行為 |
|---|---|
| lib/contract.ts / submissionSchema | v2 嚴格契約、標準 16 代碼、task/observation、日期／來源／參照一致性 |
| lib/workstyle.ts | 原創四軸定義、可見行為、中文標籤、合作建議與保守門檻 |
| lib/assessment.ts / inspectAxes、deriveAssessment | 按獨立 task 計數，重複不灌票，混合／受限／未知處理，不使用 tokens 或模型推斷 |
| lib/assessment.ts / toReport、toCardObservation | 完整證據與最小卡片資料分離 |
| lib/session-service.ts / handleSession | D1、短效讀寫權限、一次提交、原子防覆寫、冪等重試、Email gate、到期／刪除 |
| drizzle/0001_new_kinsey_walden.sql | 舊列預設 1.0，新建立明確寫 2.0；舊結果回 410 要求重新分析，授權刪除仍有效 |
| lib/collector-instructions.ts / collectorInstructions | 本機分析和上傳兩次同意、最小 JSON、禁止秘密／原文、不可繞過 Sites gate |
| lib/collector-review.ts / prepareCollectorReview | 離線重算，保持上傳同意 false |
| components/persona-app.tsx / ReportSummary | 單一焦點旅程、Email 分流、四軸觀察、逐 task 的主人要求與實際行為 |
| components/holo-card.tsx / HoloCard | CSS 3D 旋轉、厚度、柔影、虹彩、透明角色深度、減少動態效果 |
| lib/catalog.ts / artFor | 六家族十二張通用造型，與分型無關 |
| lib/export-card.ts / downloadCard | 1080 × 1620 PNG，預設暱稱模式，可顯示標準型別或未定型，保留圖片署名授權 |

前台、collector、schema、fixture 和匯出已移除舊型別、等級、舊品牌。必要 MIT 法律聲明仍在 THIRD_PARTY_NOTICES.md 與 vendor；圖片署名不省略。十二張圖片僅以中性 portrait 命名，SHA-256 完全一致，不假稱某些 MBTI 有新專屬角色。

## 實際驗證

| 驗證 | 指令 | 結果 |
|---|---|---|
| 型別 | npm run typecheck | exit 0 |
| 規則／D1／collector | npm test | 35 / 35 |
| 最終建置後 Chrome | npm run test:browser | 7 / 7 |
| 本機建置後 HTTP | node scripts/smoke-built.mjs http://127.0.0.1:5188 | 17 / 17 |
| 官方 Sites build | node /Users/dnplus/.codex/plugins/cache/openai-curated-remote/sites/1.0.0/scripts/build-site.mjs | exit 0 |
| 離線預覽 | node scripts/review-collector.ts --approved-input fixtures/collector-review-input.json evidence/agent-mbti/collector-preview.json | type:null、????、tokens:null、uploadApproved:false、networkUsed:false |

35 項涵蓋全部 16 代碼、同任務重複、最少證據、2:1／3:2 邊界、混合、受限、主人要求不符、未知來源／覆蓋、隱私白名單、偽造評估拒絕、日期／引用錯誤、模型客戶端分列、Email gate、讀寫隔離、跨會話與平台身份綁定、並發提交、無效／過大／到期摘要、刪除、D1 重啟持久、真實舊 schema 插入後 migration 保留與重新觀察、診斷記錄不洩漏 payload。

7 條 Chrome 流程涵蓋單一焦點、返回保留、複製指令、callback、重複、完整報告、無 Email 只領卡、重新整理、手機 390 × 844 真實 touch 事件、鍵盤、reduced-motion、部分未知報告與 PNG、全部十二圖、舊瀏覽器儲存不還原、16 種標準代碼。桌面 1536 × 1024。

CUA 也在使用者的 Chrome 實際完成範例預覽／同意／收件／揭曉／報告／收藏，之後刪除該專用範例。HTTP smoke 不帶瀏覽器 Origin 的 callback 成功，但仍然是同機 loopback。

前一次建置的 HTTP smoke 曾單次收到 503（預期無效摘要 422）。兩組隔離重現均回 422，相同原流程重跑通過；沒有確認該次原因。現已加只含 event／phase／errorClass 的安全診斷，不記資料或權杖，collector 對斷線／503 限制使用原 JSON／key 重試兩次。最終 build 的 HTTP 與瀏覽器測試通過；這不代表已證明所有暫時性環境錯誤不存在。

build 僅有既有 Node module.register deprecation、Vinext 靜態路由分類提示；最終 Worker 的 SSR 與 API 已實測。期限測試由注入伺服器時間與瀏覽器時鐘驗證，未等待實際 30 分鐘。

## 可查看的成果

- evidence/agent-mbti/desktop-cover.png
- evidence/agent-mbti/mobile-cover.png
- evidence/agent-mbti/desktop-reveal.png
- evidence/agent-mbti/desktop-summary.png
- evidence/agent-mbti/desktop-report-expanded.png
- evidence/agent-mbti/mobile-collection.png
- evidence/agent-mbti/partial-report.png
- evidence/agent-mbti/card-nickname.png
- evidence/agent-mbti/card-regular.png
- evidence/agent-mbti/card-untyped.png

PNG 為實際瀏覽器下載，均已視覺檢查；unknown 不捏造四字母，暱稱卡不含型別、用量、Email 或會話能力。其他 family 截圖、測試 JSON 與原始 logs 在同一 evidence/agent-mbti 目錄。

## 邊界與下一步

目前是完整本機核心，未 push／merge／deploy、公開網站、登入、申請憑證、付費、寄信或讀取真實私人紀錄。寄信服務與私人 Sites gate 下的外部 callback 尚未驗證；不能拿整站 bypass key 或變更存取權限代替驗證。真人規則校準與動畫匯出仍未完成。

Library 的 Air 上傳 helper 在 C2 已回覆 prepare_uploads 不可用，未完成傳輸；C3 沒有轉用其他寫入通道或捏造新 Library ID。本版交付為上述本機檔案。原圖的既有 Library IDs 與來源保留，不代表新截圖已入庫。

Git 檢查點以 .walking-skeleton.json 的 C3 receipt 為準。C1/C2 保留原 evidence／receipt，因本次受授權規則改版，其舊輸入標為 STALE；沒有篡改歷史證據。C3 必須為 REUSE。
