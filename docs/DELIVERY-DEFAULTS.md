# C7 · 預設收藏分析範圍

已提供最近60×24小時、瀏覽器IANA時區、所有支援且本人所有／主機可存取的本機来源，以及Tokscale彙總。進階選項可改天數／來源與安裝意願。專屬指令填妥精確起訖，使用者只需同意一段範圍說明，不再補問工具、日期或Tokscale選項。

Tokscale只允許在同意後，工具缺少且安裝選項啟用時，使用官方`@tokscale/cli@4.18.0`；實際主機核准仍有效。沒有runtime、拒絕或一次失敗就繼續現有證據，token保持未知。已核对官方來源`junhoyeo/tokscale`；此版本的`--home`避免一般本機report隐含Cursor同步。日期介面不等於精確瞬間區間，指令要求排除不可拆分的邊界日彙總。沒有在本次實作中安裝或執行Tokscale，也沒有讀私人紀錄。

驗證：`npm run typecheck`，`npm test`60/60，官方`build-site.mjs`成功；built Worker上的`defaults.spec.ts`五語系5/5。證據在`evidence/defaults/`。初次測試有Node在受限環境崩潰，改在准許本機D1 runtime的環境後成功；DST測試期望值與Chromium空白差異已修正。

本專案仍是Agent讀取指令驅動的collector，沒有交付自動掃描／日期篩選／語意去重／抽樣／context budget的原始紀錄前處理器。`collector-scope.ts`計算與核對授權區間；`collector-runner.ts`只接收最小摘要並驗證和提交，並不掃描檔案。24個task、48個observation、24KiB都是上傳限制，不是原始掃描或模型context限制。沒有實際collector效能基準。已有session cache只保留讀取能力，不是掃描cache。

已依新授權建立一個owner-private Sites項目`appgprj_6ac9f54d8a7081918c8c15f84e24c9d7`，預期網址`https://agent-mbti-cards.dnplus.chatgpt.site`。本檢查點尚未部署，後續完成最後一屏與分享後才發布。沒有新憑證、寄信或公開存取變更。
