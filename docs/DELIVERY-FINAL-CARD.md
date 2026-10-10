# C8 · 完整第三步、等級與分享

這個檢查點把原本揭曉、解讀、收藏的分頁收斂成第三步：可拖曳完整卡片、一般／Q 版、兩句依已確認軸向產生的解讀，以及直接下載／分享。完整報告展開在同一屏。卡片預設包含 Agent MBTI、四碼、獨立的使用等級、稱號、暱稱和短句；只留暱稱是明確選項，並連帶隱藏型別、等級、短句。

`lib/card-composition.ts` 為 SVG 預覽與 PNG 的單一組版來源；`lib/export-card.ts` 將同一張 SVG 放入五種尺寸。`components/card-share.tsx` 在同一屏提供四個通用社群尺寸，事先準備 File，使用原生檔案分享或下載／複製 fallback，不自動發文。分享文字與 QR 僅含註冊測驗首頁 `https://agent-mbti-cards.dnplus.chatgpt.site/`，不含私人結果、Email、task、來源統計、會話或權杖。

`usage-level-v1` 與 `agent-workstyle-v1` 分開計算。成果列舉有嚴格型別及匿名 task／artifact／workflow 參照，沒有自由文字。LV4 要求同一成果先檢視、測試，再跨任務重用。LV5 再要求至少兩條操作 task 不重疊、各至少三個 task 且跨度至少十四天的流程，以及角色、驗收、例外、維護、回饋；維護時間需晚於首次操作。沒有證據不回填 LV0，不根據用量或 MBTI 推算。原始 ai-level-check v0.4.6 的 MIT 署名及固定來源仍保留。本次沒有改動 MBTI 票數門檻。

依後續授權改為公開首頁和原生 ChatGPT 登入。使用官方 `getChatGPTUser`、`chatGPTSignInPath`、`chatGPTSignOutPath`；沒有新增 OAuth、AuthAPI、登入路由或私人憑證。API 只接受伺服器取得的平台身份，使用 Site 專屬 user ID 雜湊綁定資料。表單不再收手填 Email；行銷選項預設關閉，保存版本／時間／選擇且可撤回，與報告無關。沒有寄信、外部行銷服務或公開結果頁。

最近一次完成結果另存七天，以限路徑 HttpOnly Cookie 加登入身份取得；HTTPS 設 Secure。沒有把 Email、原文、寫入權杖或報告持久放進 localStorage。可清除結果，或開始新觀察並保留舊結果直到新的完成。清除會等待本頁正在保存的請求，伺服器以原子條件寫入避免已刪除會話重新產生保存副本；清除保存結果也會撤銷原會話。30 分鐘提交效期與七天已完成結果保留是兩個不同期限。

## 驗證

- `npm run typecheck`。
- `npm test`：69 個規則、collector、D1、重啟、並發、失效、權限、行銷及 recall 檢查。
- 官方 `build-site.mjs` 建置；套用本機 0003 remembered_results 與 0004 marketing_preferences。
- `npm run test:browser`：18 個 built Worker 瀏覽器情境。包括五語系、192 格圖庫、16 種 callback 結果、手機觸控、方向鍵、reduced-motion、登入前後流程、同帳戶 recall、其他身份隔離、過期與換新目的地、分享。
- 五語系各 7 張 PNG：一般／Q 版卡片、四種社群尺寸、暱稱模式，共 35 張實際下載，以 PNG 尺寸和 jsQR 解碼驗證。四模組白色 quiet zone，無裁掉卡面資訊。
- `node scripts/smoke-built.mjs http://127.0.0.1:5188`：26 個實際 HTTP／D1 檢查。callback 用沒有瀏覽器 Cookie／身份的 HTTP 請求，只傳短效 write capability。ISTJ Q 版 served bytes 雜湊核對為 `99ded2f46ab6f9dbf87f69796310f9aac40f8fab823cfdcc0a7d9a212825f01d`，與素材清單一致，已人工檢視原圖。

所有本機身份都是明確的虛構測試 headers，不是真實 ChatGPT 登入。Native Web Share 呼叫以 browser stub 檢查 payload／重複點擊防護，下載 fallback 為真實 Chrome 下載；沒有宣稱已發到外部平台。圖庫與預設範圍見 `remaining-browser-results.json`；清除修正後的流程與五語匯出見 `final-journey-results.json`、`export-ready-results.json`。最終單元及建置結果見 `evidence/final-card/` 內的 `unit-results.txt`、`build-results.txt`、`built-worker-smoke.json`。整批瀏覽器執行曾在匿名 HTTP 請求與下載等待逾時，完整記錄保留在 aggregate-attempt 和 download-race-before。下載問題定位到快速換尺寸時，useEffect 尚未清除舊檔案而按鈕短暫可點；已改成準備結果綁定完整 composition／尺寸 key，當次檔案才可啟用按鈕。修正後分組重跑相關情境，未將逾時視為通過。

視覺已檢查手機第三步、桌面第三步、完整一般／Q 版 PNG、限時及正方形版型。截圖存於 `evidence/final-card/`，例如 `zh-TW-desktop.png`、`zh-TW-mobile.png`、`zh-TW-card-chibi.png`、`zh-TW-landscape.png`。

## 範圍界線

真人來源採樣是否完整、抽樣是否偏向製作任務、語意上的獨立任務是否被重複計算，不能由這份最小 JSON 證實；伺服器只能驗證其結構和計算一致性。使用者先前的 ISTJ 結果不因期待不同就被改寫。沒有進行新的私人紀錄掃描、Tokscale 安裝或 collector 效能 benchmark。寄信、動畫匯出和真人採樣校準仍未完成。遠端原生登入、匿名身份 header 防偽及 callback 的觀察另見 C9，不以本機 fixture 宣稱遠端成功。
