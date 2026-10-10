# 本機交付與驗證

2026-10-10，Air macOS，Node v26.7.0。獨立專案 `/Users/dnplus/Documents/Codex/2026-10-10/task-2/ai-usage-card`；初始 Git checkpoint `a54fc84b3a65fd5739b1d6a9b0897f18f047da8c`。Agent House 與 genioone-private 未改動。

## 已觀察到的完整路徑

Chrome 暱稱表單 → 可選 Email 用途同意 → 後端建立 D1 會話 → 顯示交給 Agent 的指令 → 獨立本機 HTTP caller 使用 writeToken 回傳虛構 JSON → browser 用 readToken polling → 真實報告 UI → 重整恢復 → 一般／Q 版 → PNG／暱稱 PNG → 刪除。沒有以純前端換頁冒充 callback。

原生 Chrome CUA 另手動操作過本機 JSON 預覽、確認勾選、範例提交與報告；並清除該專用測試結果。IAB 在此環境不可用，使用現有 Chrome。瀏覽器固定尺寸已還原；本輪 5188／5189 預覽程序已停止，啟動方法見 README。自動化測試使用獨立 Chrome context，無登入、無歷史紀錄讀取、無真實使用者資料。

## 檢查與記錄

| 執行 | 結果 | 檔案 |
| --- | --- | --- |
| `npm run typecheck` | 成功 | `evidence/typecheck-results.txt`，exit 0 |
| `npm test` | 24/24 通過；真實 Miniflare D1，不是 mock SQL | `evidence/unit-results.txt` |
| `npm run test:browser` | 5/5 通過；1536×1024、390×844、真實 touch dispatch、reduced motion | `evidence/browser-run.txt`, `browser-results.json` |
| Sites 官方 `scripts/build-site.mjs` | 成功；產物 `dist/server/wrangler.json` | `evidence/build-results.txt` |
| `npm start -- --port 5189` + `node scripts/smoke-built.mjs` | 13 個檢查通過；建置後 Worker + 本機 D1 | `evidence/built-worker-smoke.json` |

24 個資料/API 測試涵蓋：未知保留、token 不升級、LV4 測試/重用/交接、LV4+ 自測、LV5 持續多流程與維護、多入口實際使用與本機模型例外、模型/客戶端分離、並列模型未知、原文或路徑額外欄位拒絕、缺同意/負數/無效日期/明日日期/錯誤評級拒絕、192 位置只有 12 張 ready、讀寫權限隔離、跨會話隔離、平台擁有者、單次與同內容重試、競態防覆寫、到期與撤銷、大小/暱稱/來源限制、D1 重啟持久性。

5 個 browser journeys 涵蓋：完整桌面表單／HTTP callback／重整／雙畫風／三個 PNG／刪除；手機無橫向溢出及 touch 拖曳；減少動態；未知分型與待製作插圖；12 個圖片實際解碼、切換後評估與最常用模型保持一致。沒有錄製含讀寫權杖的 trace；保存的截圖不含權杖。表單截圖裡的 fixture@example.test 是虛構資料。

建置後額外檢查 SSR 首頁、session create/read、錯誤權限、額外原文欄位拒絕、無瀏覽器 Origin 的外部本機 callback、原 key 重試、report、3 個靜態檔、刪除與刪除後失效。這證明建置產物的本機路徑，不證明私人 Sites 遠端閘門可通過。

## 主要檔案

- UI：`components/persona-app.tsx`, `session-flow.tsx`, `holo-card.tsx`, `app/globals.css`。
- 協定／邏輯：`lib/contract.ts`, `assessment.ts`, `collector-instructions.ts`, `catalog.ts`, `fixture.ts`。
- API／儲存：`lib/session-service.ts`, `app/api/`, `db/schema.ts`, `drizzle/0000_quick_devos.sql`。
- 匯出：`lib/export-card.ts`。
- 公開最小協定：`public/collector-protocol.md`, `collector-template.json`, `collector-schema.json`；虛構 sample `fixtures/pvse-lv4-plus.json`。
- 素材：`public/art/` 共12張；`docs/ART-PROVENANCE.md`, `ASSET-VERIFICATION.json`；框架原文 `vendor/ai-level-check/`。

## 截圖與 PNG

- `evidence/desktop-home.png`：最終首屏。
- `evidence/desktop-form.png`：暱稱／選填 Email 與用途同意。
- `evidence/desktop-report-regular.png`, `desktop-report-chibi.png`：同一實際 callback 的雙畫風。
- `evidence/report-details.png`：四軸／用量／觀察覆蓋。
- `evidence/mobile-home.png`, `mobile-chibi.png`, `mobile-form.png`：手機版。
- `evidence/reduced-motion.png`：靜態降動態版。
- `evidence/family-{codex,claude,gemini,grok,deepseek,glm}.png`：六家族預覽。
- `evidence/report-regular.png`, `report-chibi.png`, `report-nickname-only.png`：實際下載的 1080×1620 PNG。

## 邊界與下一步

1. 遠端私人 Sites 外部 webhook 尚未驗證。本輪沒有 site registration/project ID、部署或存取權變更；不能拿 localhost 成功宣稱遠端可收件。需要獲授權的精確 endpoint 測試，不能用整站 bypass key 或公開網站來繞過。
2. 未讀任何真人 session，也未實際執行 Tokscale。collector 交付的是可由本人 Agent 執行的協定、模板與逐會話指令，沒有會自動掃描機器的程式。真人驗證必須另取得明確來源與期間授權，再確認送出摘要。
3. 只有六家族 PVSE 一般／Q 版共12張，其餘180張待製作。已保留非商業同人署名、share-alike與上游權利鏈未全面核實的說明。
4. 動畫匯出尚未實作；目前可靠提供靜態 PNG。
5. 到期即禁止新的讀寫；實體清除在後續請求觸發。選填 Email 只是同會話暫存，沒有寄送功能。關閉頁面後不提供公共分享結果網址。
6. 本機工具鏈提示 Node module.register 棄用與 Vinext 靜態路由分析限制；建置成功且建置後 SSR/API 檢查通過。未在本輪擅自升級官方 starter。

所有 API 測試僅使用虛構資料。沒有 push、merge、部署、OAuth、新 API 憑證、付費服務、帳號登入、Email 寄送或真實資料外傳。
