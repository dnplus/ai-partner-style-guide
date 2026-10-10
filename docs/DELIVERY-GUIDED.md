# AI 人物誌：單步體驗交付 C2

2026-10-10，Air 本機，獨立專案：
`/Users/dnplus/Documents/Codex/2026-10-10/task-2/ai-usage-card`

本次已將較擁擠的 C1 首頁改為逐步流程：開始 → 暱稱 → 交給 Agent → 真實等待 → 揭曉 → 報告（有 Email）→ 收藏。卡面樣式只在收藏時出現，說明、範例與16型放在次要入口。Agent House 與 genioone-private 完全獨立，沒有帳號、同步或前置依賴。

## Email 規則已落在後端

- 不填 Email：GET session 回傳卡片所需的暱稱、資料種類、評級／分型與模型家族；`report=null`，沒有用量、案例、來源或完整報告。重整也無法取得。
- 填 Email 且勾選結果用途：可查看完整觀察報告。Email 不交給 collector、不出現在下載 PNG，不作行銷用途。
- 寄信服務尚未接通。API 回覆 `delivery=not_configured`，表單與報告均明示不會寄信。**沒有宣稱已寄送或已收到 Email。**

## 已實作

1. 分頁式單焦點 UI、返回保留狀態、複製與手動複製、真實收件 polling、斷線退避／重試、到期與取消恢復、重整後還原讀取權限。
2. D1 30分鐘持久會話、讀寫權杖分離與雜湊、單次提交、相同 key／JSON 可重試、嚴格24 KiB資料驗證、跨來源與擁有權邊界。未放 PII 或 token 在網址。
3. 固定 MIT 框架 v0.4.6／commit d262ca67a6efa59ffb0e0a2a2843978a149e047d；未知保留，tokens不提高等級，模型家族與客戶端分離。
4. 六家族 PVSE 的12張既有同人插圖，共享一般／Q版 viewer。其餘180張未生成，界面沒有聲稱完成。保留 ApprenTice／ZipZipPipe、DeepSeek另含上善無形署名及CC BY-NC-SA4.0。
5. CSS3D實體卡：卡厚、軟陰影、角度虹彩、選擇性foil、角色與文字深度；觸控／滑鼠／方向鍵；減少動態模式。
6. 1080×1620 PNG；預設只顯示暱稱，可選顯示評級／分型。圖片沒有 Email、用量、權杖或會話連結，保留署名與非官方／非商業說明。
7. 離線最小 JSON 審查工具，重新計算分級、不執行網路、不掃原始紀錄、預覽的上傳同意維持 false。詳見 `docs/COLLECTOR-VALIDATION.md`。

## 真正執行的驗證

| 命令／介面 | 結果 | 記錄 |
| --- | --- | --- |
| `npm run typecheck` | exit 0 | `evidence/guided/typecheck-results.txt` |
| `npm test` | 28/28 通過 | `evidence/guided/unit-results.txt` |
| `npm run test:browser`，dev | 6/6 通過 | `evidence/guided/browser-run.txt` |
| Sites 官方 `build-site.mjs` | exit 0 | `evidence/guided/build-results.txt` |
| `npm run test:browser`，最終建置 Worker | 6/6 通過 | `evidence/guided/built-browser-run.txt`, `browser-results.json` |
| `node scripts/smoke-built.mjs http://127.0.0.1:5188` | 17/17 通過 | `evidence/guided/built-worker-smoke.json` |
| 原生 Chrome 操作 | 表單→JSON預覽→同意→callback→無Email卡片→刪除 | 本機專用虛構資料；另檢視最終建置首頁 |
| `node scripts/review-collector.ts --approved-input …` | fixture預覽unknown/????，同意上傳false | `evidence/guided/collector-review-run.json`, `collector-preview.json` |

測試包含真人表單操作方式、返回保留暱稱、Email用途同意、無Email API最小回應、複製、無Origin的本機外部caller、非法／重複／過期提交、exact retry、跨會話／讀寫權限、D1重啟持久性、並行防覆寫、刪除、斷線重試、重整權杖遺失恢復、一般／Q版與六家族、手機真實touch dispatch、reduced-motion與鍵盤操作、未知評估及實際PNG下載。

到期：服務端以指定時鐘在真實Miniflare D1測試拒絕過期讀寫；UI復原另以瀏覽器測試時鐘推進，沒有真的等30分鐘。所有資料都是fixture，不當作真人校準。自動化使用獨立Chrome context，無登入或歷史資料存取。

## 最終截圖與檔案

- `evidence/guided/desktop-cover.png`、`mobile-cover.png`：首頁。
- `desktop-identity.png`、`desktop-email.png`：暱稱與折疊Email。
- `desktop-instructions.png`、`desktop-waiting.png`、`mobile-waiting.png`：指令與等待；截圖無提交／讀取權杖。
- `desktop-reveal.png`、`mobile-reveal.png`：單獨揭曉。
- `desktop-summary.png`、`desktop-report-expanded.png`：Email路徑的報告。
- `desktop-collection-chibi.png`、`desktop-collection-regular.png`、`mobile-collection.png`：收藏與雙畫風。
- `card-nickname.png`、`card-regular.png`：實際下載PNG。
- `expired.png`、`reduced-unknown.png`：到期及未知／減少動態。

UI對照：`docs/DESIGN-GUIDED.md`、`docs/FIDELITY-GUIDED.md`；來源與素材驗證：`docs/ART-PROVENANCE.md`、`docs/ASSET-VERIFICATION.json`。Library存檔未能完成：此Air的存檔流程回報Library上傳不可用，未確認任何檔案ID；沒有重複重試或改走另一條寫入路徑。所有交付仍保留於本機，清單見 `docs/LIBRARY-GUIDED.json`。

## 本機預覽與外部限制

最終建置目前以 `npm start -- --port 5188` 啟動，僅監聽 `http://127.0.0.1:5188/`。若程序已停止，可在專案目錄用同一命令重啟；重建步驟見README。這是本機程序，不是公開部署。

未部署、push、merge、修改權限、申請新憑證、登入或寄信。私人Sites存取閘門下的外部callback **尚未驗證**；本機17個檢查不能證明遠端可收件。沒有分享整站bypass key。

沒有讀取使用者私人會話或實際執行Tokscale掃描。只確認既有Tokscale help，未取得被授權的真實彙總匯出；因此不對使用者斷言LV4+或PVSE/QVSE。缺少真實行為證據、寄信服務與遠端閘門驗證是後續的外部條件。動畫匯出尚未實作，PNG核心已完成。

C1歷史證據與收據保留不動；C2重新覆蓋全部受影響路徑。舊C1收據按原始commit比對會顯示STALE，當前交付以C2的新commit、測試和收據為準，不修改既有收據或偽稱舊版仍一致。
