# 你的 Agent MBTI

以本人授權的使用紀錄，觀察你帶領 Agent 的合作方式。三個主步驟：命名與選填偏好 → 將專屬指令交給自己的 Agent → 同一屏揭曉完整卡片、簡短解讀與完整報告。一般／Q 版切換、下載、分享都留在第三步。

首頁公開；開始觀察與讀取私人結果需 Sites 原生 ChatGPT 登入。Email 來自受信任的平台身份，不另填表單、不出現在 collector、卡片、網址或瀏覽器儲存空間。行銷勾選預設關閉，與完整報告無關，可於「關於這份觀察」撤回。目前只保存偏好，沒有寄信或外部行銷服務。

註冊網站：https://agent-mbti-cards.dnplus.chatgpt.site/ 。實際發佈與遠端驗證狀態以 `docs/DELIVERY-PUBLIC.md` 為準。

## 本機使用

專案位於 `/Users/dnplus/Documents/Codex/2026-10-10/task-2/ai-usage-card`。此 Air 使用 Node 26.7.0，已安裝依賴並套用 0000–0004 本機 D1 migration。執行 `npm start -- --port 5188` 開啟已建置的 Worker；網址 `http://127.0.0.1:5188`。不要同時啟動同 port 的 dev server。

全新 checkout 先執行 `npm run install:ci` 和 `npm run build`，再依序、僅一次套用尚未執行的 `drizzle/*.sql`：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_quick_devos.sql
```

將範例檔名替換為下一個 pending migration，勿重播已執行檔案。這些命令只修改本機預覽資料，不部署。Sites 官方入口見 [starter 記錄](docs/SITES-STARTER.md)。

localhost 沒有 Sites 登入 dispatcher；因此匿名只能看首頁，原生登入只能在託管網址完成。自動測試以虛構 dispatch headers 模擬身份，不能視為真實 ChatGPT 登入驗證。登入後，頁尾「關於這份觀察」內可用虛構資料走同一條 callback 流程。

## 判定與資料

借用標準 16 個 MBTI 代碼，描述你帶 Agent 的方式（`agent-workstyle-v2`）。只看你的訊息，不看 Agent 自己的習慣；規則、門檻、稱號及描述是本專案的定義，並非心理測驗。

- E/I：途中掌舵（看中間結果、改方向或範圍）／開場定調（目標與限制先講清楚，之後少插手）。
- S/N：給具體做法（檔案、步驟、指令、範例）／給目標與方向，路線交給 Agent。
- T/F：以明確檢查驗收（測試、數字、規格、差異）／以感受、品味、受眾體驗驗收。沒有驗收就是 unclear。
- J/P：當成有結構或會留下來的工作（計畫、流程、可重用資產）／開放式探索、一次性使用。

每個任務每軸強迫選一邊或 `unclear`。伺服器每軸只數非 unclear 的選擇：少於 3 個或打平為 `?`；多數勝出，勝方 ×3 ≥ 總數 ×2 且差至少 2 為 clear，其餘為 lean（卡面以淡色標示）。四個字母都有結果才成為 16 型代碼。使用者不會看到百分比或次數。tokens、模型家族與客戶端不參與分型。

**獨立的使用等級 LV0–5**（`usage-level-v2`）分兩個面向。LV0–3 看 Agent 在授權紀錄中看到的人為證據：未查核就採用、出錯後重試、兩個獨立任務確認結果可用，以及同一任務先講清範圍與完成標準再驗證修正。LV4–5 只看 `collect.py` 計算並原樣帶入摘要的 `systemEvidence`：LV4 需至少一個工作階段寫下技能、規則或腳本等資產，且至少兩個工作階段用到其他階段寫下的資產；LV5 另需至少三個自動化工作階段、跨度 14 天以上、至少一種排程／CI／hook／heartbeat 機制，以及自動化開始後仍有資產更新。沒有證據就是未知，不能當 LV0。

[觀察設計](docs/DESIGN-MBTI.md)、[collector 技能](public/collector/SKILL.md)、[空白模板](public/collector-template.json)、[JSON schema](public/collector-schema.json)、[第三方聲明](THIRD_PARTY_NOTICES.md)。schema 3.0 的每個 task 帶 `axes`，可選 `usageEvidence` 與 `systemEvidence`；缺少時對應的等級保持未知。更早的舊型別不會被偷偷轉成 MBTI。

## 已實作

- Sites 官方 Vite/Vinext、React、D1；會話有效 30 分鐘，讀寫分離的 256-bit 權杖，只存雜湊。所有私人讀取同時要求正確 ChatGPT 帳戶與讀取權限。
- 外部 Agent 的 callback 只需其短效寫入權杖，不能讀取結果。一次原子提交、相同 key／內容可重試；嚴格 JSON、24 KiB 上限、來源／日期／引用與結果一致性驗證。
- 三步流程、真實進度、返回、斷線重試、到期換新目的地；寫入權杖不持久保存。30 分鐘不是掃描耗時保證。
- 最近結果保存最多 7 天，以 HttpOnly、SameSite=Strict、HTTPS Secure 且限 `/api/remembered` 的 Cookie，加上同一登入帳戶讀取。可清除或開始新觀察。localStorage 只有語言偏好；sessionStorage 有短效讀取權限及介面偏好，不含 Email 或原始紀錄。
- 同一套 SVG composition 驅動預覽和 PNG，預設顯示 Agent MBTI、四碼、等級、稱號、暱稱、短句。暱稱模式需明確選取。CSS 3D 厚度、柔影、角度虹彩、選擇性 foil、桌面拖曳／手機觸控／方向鍵；reduced-motion 靜態卡。
- 六家族 × 16 型 × 一般／Q 版，共 192 張不同插畫。換造型不重新判定；未知使用中性卡面。`/art-gallery` 可檢視完整圖庫。
- 繁中、簡中、日文、韓文、英文；流程、指令、報告、等級、分享與下載均隨語言切換。
- 1080×1620 卡片、1080×1350 直式、1080×1920 限時、1080² 正方形、1200×630 橫式 PNG。QR 和文字僅指向測驗首頁，沒有私人結果或權杖。系統支援檔案分享時使用 Web Share，否則下載並提供文字；沒有自動發文。
- Collector 指令預設最近 60 個本地日（當地 00:00 到現在）、IANA 時區、所有支援且本人所有／主機允許存取的本機來源、Tokscale。一次說明並取得範圍與傳送授權，仍遵守主機原生核准。缺少工具、拒絕或一次安裝失敗時繼續現有證據，不捏造用量。

## 驗證與限制

執行 `npm run typecheck`、`npm test`、`npm run verify:art`、`npm run test:browser`、`node scripts/smoke-built.mjs http://127.0.0.1:5188`。測試只使用隔離 Chrome、專用虛構資料和本機 D1。HTTP smoke 限 loopback。

測試與驗證腳本的輸出寫到 `evidence/`，不納入版本控制。發佈與原生登入的實際觀察記在 `docs/DELIVERY-PUBLIC.md`。

本專案交付的是 Agent 指令和最小摘要驗證／提交協定。網站本身不掃描紀錄。`collect.py` 在時間預算內抽樣本地日誌，供合作風格分類，並用 Tokscale 的 client／model 總量顯示 token。它不算完整會話數。24 個 task、48 個 MBTI observation、64 個成果 observation、24 KiB 是上傳限制，不是模型讀取紀錄的成本上限。

圖片是 ApprenTice 同人衍生，角色參考 ZipZipPipe；DeepSeek 另含上善無形。CC BY-NC-SA 4.0：非商業、署名及相同方式分享。GPT 龍娘是 Codex 主題改編，並非官方角色；上游權利鏈未全面核實，沒有模型業者背書。[素材來源](public/art-provenance.md)。

真人證據校準、動畫匯出、寄信尚未完成。資料過期後拒絕讀寫，於後續請求清理；沒有宣稱到期瞬間背景刪除。

網站素材採原尺寸 WebP（品質 98、透明度一致），原始 PNG 全數保存在 `art-source/`。編碼、來源 hash 與 Sites 封裝限制說明見 [ART-DELIVERY](docs/ART-DELIVERY.md)。
