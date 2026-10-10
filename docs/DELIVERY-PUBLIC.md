# C9 · Sites 公開入口與私人結果

正式網址：https://agent-mbti-cards.dnplus.chatgpt.site

Sites 已於 **2026-10-10T10:05:05.716467Z** 回傳部署成功。只有一個 Site、一個已保存版本與一次正式部署。

| 項目 | 確認值 |
| --- | --- |
| Site | `appgprj_6ac9f54d8a7081918c8c15f84e24c9d7` |
| 版本 | `1`；`appgprj_6ac9f54d8a7081918c8c15f84e24c9d7~appgver_ccab939bccb88191928c0c6af0c4b6eb` |
| 部署 | `appgdep_6aca0daceea08191ab3d6e269cb6735b`；`succeeded` |
| 已發布 source SHA | `6b0c804e492f72819832b0c1030e4a3ee7b285a3` |
| 主要工作區已驗證程式碼 | `2882bc2bf8173566abe9ac7d73448c0d4ff384b3` |
| audience | `public`，依使用者授權套用 revision 2 |
| 本地封裝 | `ai-usage-release/outputs/site-release.tar.gz`；122,555,673 bytes |
| 封裝 SHA-256 | `2db9a3049c909643d90f5d1906b3d22d0b9e91b50f6f86eabc94fe04e1108121` |

## 實際驗證範圍

- 正式站 21/21 HTTP 檢查：匿名首頁、原生登入入口、匿名／偽造身分標頭無法建立或讀取私人會話、remembered 與 account 寫入權限、缺少或錯誤 callback 權限的拒絕，以及正式插畫 SHA-256。
- Chrome 已真正開啟正式首頁並顯示完整人物卡；原生「使用 ChatGPT 登入」導向 OpenAI 的既有帳號選擇及通行金鑰驗證。
- **目前待本人完成通行金鑰驗證。** 尚未取得正式站登入後的成功身分，因此尚未聲稱正式有效 callback、登入後報告、七天取回或正式下載流程已端到端通過。登入分頁已保留供接手。沒有使用 Site bypass key 或偽造身分建立正式會話。
- 本機 rebuilt Worker：69/69 單元與 D1 測試、26/26 HTTP 檢查、型別檢查及官方建置通過。
- 素材修正後的 4 個針對性瀏覽器情境已通過：192 張圖庫解碼、16 型經真正本機 callback 對應所有192張、繁中一般／Q版與五種尺寸及暱稱卡 PNG、手機拖曳／鍵盤／減少動態效果。實際下載13張PNG，其中繁中7張驗證尺寸與QR。初次手機測試還期待舊 `.png` 路徑，修正測試期待後單獨重跑通過；失敗與重跑記錄均保留。
- C8 的18個不同瀏覽器情境、五語系35張PNG與完整功能證據仍保留於 `evidence/final-card/`；它們是前一個已驗證程式碼版本的結果，不混稱為此次正式站測試。

## 素材與原始碼保存

原始PNG封裝超過Sites256MiB上限，保存版本前即遭拒絕。網站改用原尺寸、品質98的WebP，透明度逐像素一致；192張交付插畫合計121,788,932bytes。所有204張原始PNG完整移到`art-source/`，逐檔SHA-256與C8一致；角色未重新生成、裁切或縮放。這是有損色彩編碼，詳見`ART-DELIVERY.md`與`evidence/published/art-encoding.json`。

原始開發repo、歷史及QA圖片保存在`ai-usage-card`。`ai-usage-release`是同一個Sites的傳輸checkout，避免首次Git請求過大；排除非執行階段QA點陣圖。363個執行階段與建置檔案逐位元比對一致。所有中間素材批次都沒有建立版本或部署。原始PNG不在公開靜態資產封裝中。

## 接續驗證

本人完成原生登入後，用UI建立暱稱 **Published Fixture** 的專用測試會話，行銷選項保持未勾選。`scripts/verify-external-collector.mjs` 接受一行JSON字串形式的專屬指令（TTY輸入隱藏），只向這個正式站以會話write capability提交標示為fixture的摘要；不使用Cookie、原生身分標頭或Site bypass key，證據不保存會話ID或權限字串。驗證無效輸入、一次收件、相同重試及衝突後，從UI確認INTJ／LV4示範結果、切換樣式、下載、重新整理取回，最後清除該專用fixture。

沒有執行使用者真實私密紀錄分析、Tokscale安裝或效能基準；沒有郵件服務、寄信或行銷外送。動態影片匯出未實作，現有成品為PNG。原型分型是使用習慣觀察，不是經驗證的心理測驗。角色仍是具署名與CC BY-NC-SA4.0限制的非官方同人改編，未宣稱完整上游權利鏈已清理。
