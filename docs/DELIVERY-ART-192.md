# C5 交付：192 張專屬插畫

192 格已全部整合，來自核定的 157 張選配與新增 35 張；每張在 Air 由 Library materialize 取得並驗證 bytes。沒有使用跨型 fallback，沒有生成重複素材。lib/art-manifest.json 是 family + type + style 的唯一索引，來源 ID、原檔名與 SHA256 記於 docs/art-192，192 格像素驗證記於 evidence/art-192/verification.json。

前台卡面、獨立 /art-gallery、放大檢視、完整回傳後的結果卡與 PNG 使用同一索引。未知保留中性圖，缺圖不冒充完成。未變更分型、collector、收件權限或 Email gate。Email 空白仍只回傳卡片；填寫並同意結果用途才有完整報告，本機不寄信。

## 驗證

- npm run verify:art：192/192 完整，192 個 SHA256、192 個解碼像素雜湊，沒有重複或缺圖。
- npm run typecheck：通過。
- npm test：51/51。
- 官方 Sites build-site.mjs：成功。
- node scripts/smoke-built.mjs http://127.0.0.1:5188：20/20，真正本機 built Worker 與 D1。
- npm run test:browser：10/10，2.1 分鐘。12 個圖庫視圖各載入16張；16種型別各經過表單、獨立 session、callback、結果，再切6家族×2畫風，核對192個 src 與圖片 decode。也驗證 nickname-only、手機觸控、reduced motion、到期、重複回傳與回復。
- 實際下載 INTP／ENFJ／ESFP 一般與 Q 版6個1080×1620 PNG，另有暱稱與未知卡。資料夾 evidence/art-192。

12 張圖庫全頁截图均已視覺檢視：16型具不同道具、姿態或構圖，角色完整，底部標籤可讀。額外檢視 INTP 一般與 ENFJ Q 版 PNG，主圖與文字間距清楚，保留角色與授權署名。gallery-inspector.png 與 gallery-mobile.png 檢查放大、手機排列；192 張不代表逐張全尺寸人工細節審查。

初次自動化遇到精確 label locator 與 select option 文字相連，改以其正確 combobox role/name。另一次在測試期間重建 dist，使旧 runtime 使用過期資產 hash、後6個情境載入失敗。已停止舊 runtime、使用完整新 build 重啟並重跑全部10項，最終紀錄 built-browser-run.txt 為全通過。這些失敗未算成功。

## 邊界

目前僅127.0.0.1本機；外部 Agent 穿越私人 Sites 存取閘門尚未驗證，沒有部署或分享 bypass key。沒有寄信服務、真實個人紀錄驗證或動態影片匯出。Library 上傳交付工具先前不可用，交付物留在 Air。圖片依 ApprenTice、ZipZipPipe、DeepSeek另含上善無形來源及 CC BY-NC-SA4.0 使用；上游權利鏈未全數確認，無官方背書。Codex 是 GPT 娘同人適配。

下一個獨立 checkpoint C6 是使用者新增要求的五語系完整流程；本文件只證明 C5 插畫與既有繁中流程。
