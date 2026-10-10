# 本機 Collector 審查與證據覆蓋

2026-10-10，在 Air 只確認既有 Tokscale 的 `--help` 與 `models --help`。沒有執行會掃描私人會話的 models / clients / usage 模式，沒有讀登入、憑證或私人 session 資料。此專案可用來源只有本次建立的明確虛構 fixtures，沒有使用者另行提供的真實彙總匯出。

所以目前不對使用者給出真人等級；先前的 LV4+、PVSE/QVSE 都仍是待驗證假設，不能從本次網站建置結果倒推。

## 已可執行的離線審查工具

`lib/collector-review.ts` 與 `scripts/review-collector.ts` 接收 Agent 依協定產生、本人授權讀取的最小 JSON。它不是原始紀錄掃描器，也不假稱可以只靠用量評估風格。

1. 本人先批准來源與期間，Agent 在本機形成匿名抽象案例和彙總。
2. 輸入必須 `localAnalysisApproved=true`、`aggregateUploadApproved=false`。來源檔只接受一般 JSON、最多24 KiB，拒絕已知會話／憑證目錄及額外欄位。
3. 工具使用同一份網站規則重新計算 level/type，產生 0600 權限的新預覽 JSON；絕不覆寫來源。
4. 顯示完整預覽、覆蓋與缺口給本人；得到針對這一版的第二次同意後，Agent 才依精確 session 指令送出。

```sh
node scripts/review-collector.ts --approved-input fixtures/collector-review-input.json /tmp/persona-preview-example.json
```

只會寫一個本機預覽檔；無網路、無 HTTP 提交、無 Tokscale 子程序、無來源目錄探索。重跑時換新的輸出路徑，或由本人自行管理前一份預覽。

本輪實際執行結果：`evidence/guided/collector-preview.json` 與 `collector-review-run.json`。這是 **fixture**，不是真人結果：`level=unknown`、`type=????`、tokens 與使用量 null、來源空、上傳同意 false。另有自動測試確認即使草稿硬寫 LV5/QAOC，也會按既有證據重新計算，不能指定結果。

## 真實驗證還缺什麼

需要本人指定的、可授權讀取的實際彙總匯出及行為證據摘要。Token/model 彙總本身不能證明驗證、複用、測試與維護。若 Tokscale 的預設讀取範圍會碰到未授權或受限資料，就停止；不要因為工具存在就執行全機掃描。沒有取得的欄位繼續保留未知。

沒有把私人摘要或原始紀錄上傳至網站、Library 或其他服務。交付截圖只含虛構示範資料。
