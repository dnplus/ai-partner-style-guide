# 你的 Agent MBTI

以本人授權的使用紀錄，觀察你帶領 Agent 的合作方式。三個主步驟：命名與選填偏好 → 將專屬指令交給自己的 Agent → 同一屏揭曉完整卡片、簡短解讀與完整報告。一般／Q 版切換、下載、分享都留在第三步。

不需登入，也不收集 Email。每次觀察建立一組匿名會話：讀取權杖只留在建立連結的瀏覽器，寫入權杖只交給 Agent 提交一次摘要。部署在自己的 Cloudflare 帳號（Workers + D1 + 靜態資源），網址為 `agent-mbti.<子網域>.workers.dev`。

## 本機使用

需要 Node 22.13 以上。

```sh
npm ci
cp .dev.vars.example .dev.vars   # Turnstile 測試用 secret，永遠通過
npm run build
npm run db:migrate:local         # 套用 drizzle/*.sql 到 .wrangler/state 的本機 D1
npm run preview                  # 已建置的 Worker：http://127.0.0.1:5188
```

開發時可改用 `npm run dev`（Vite + HMR）。改了 `wrangler.jsonc` 後執行 `npm run cf-typegen` 更新 `worker-configuration.d.ts`。改了 `db/schema.ts` 後執行 `npm run db:generate` 產生新 migration。

本機用 Cloudflare 公開的 Turnstile 測試金鑰（`wrangler.jsonc` 的 `TURNSTILE_SITE_KEY` 預設值與 `.dev.vars.example`），不連線任何遠端資源。

## 部署

正式站是 https://agent-mbti.dnplus.workers.dev。D1 `agent-mbti` 已綁在 `wrangler.jsonc`，Turnstile secret 已設在 Worker 上，正式 site key 由 `npm run deploy` 以 `--var` 帶入，所以本機一直用測試金鑰。

每次更新只需 `npm run deploy`；有新 migration 時先跑 `npm run db:migrate:remote`。部署到別的帳號或網域時，要換掉 `wrangler.jsonc` 的 `database_id`、deploy 指令裡的 site key，並重設 `TURNSTILE_SECRET_KEY`。

## 濫用防護

- 建立連結（人按下按鈕、會產生權杖的那一步）需要 Turnstile；伺服器以 siteverify 驗證 secret、action `create_session` 與主機名稱。
- 每個 IP（`CF-Connecting-IP`）每分鐘最多建立 5 個連結；Agent 的提交與進度回報每分鐘 60 次。超過回 429 並在介面顯示當地語言的提示。Agent 端不需 Turnstile。
- 沒有全站會話總量上限：任何固定上限都可能被分散來源灌滿，或在正常流量高峰擋下真人。會話 30 分鐘到期，過期資料在下次建立時清除。

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

- Vinext（Vite 上的 Next.js App Router）、React、Cloudflare Workers、D1；會話有效 30 分鐘，讀寫分離的 256-bit 權杖，只存雜湊。私人讀取只需讀取權杖。
- 外部 Agent 的 callback 只需其短效寫入權杖，不能讀取結果。一次原子提交、相同 key／內容可重試；嚴格 JSON、24 KiB 上限、來源／日期／引用與結果一致性驗證。
- 三步流程、真實進度、返回、斷線重試、到期換新目的地；寫入權杖不持久保存。30 分鐘不是掃描耗時保證。
- 最近結果保存最多 7 天，以 HttpOnly、SameSite=Strict、HTTPS Secure 且限 `/api/remembered` 的 Cookie 讀取。可清除或開始新觀察。localStorage 只有語言偏好；sessionStorage 有短效讀取權限及介面偏好，不含原始紀錄。
- 同一套 SVG composition 驅動預覽和 PNG，預設顯示 Agent MBTI、四碼、等級、稱號、暱稱、短句。暱稱模式需明確選取。CSS 3D 厚度、柔影、角度虹彩、選擇性 foil、桌面拖曳／手機觸控／方向鍵；reduced-motion 靜態卡。
- 六家族 × 16 型 × 一般／Q 版，共 192 張不同插畫。換造型不重新判定；未知使用中性卡面。`/art-gallery` 可檢視完整圖庫。
- 繁中、簡中、日文、韓文、英文；流程、指令、報告、等級、分享與下載均隨語言切換。
- 1080×1620 卡片、1080×1350 直式、1080×1920 限時、1080² 正方形、1200×630 橫式 PNG。QR 和文字指向目前網站的首頁（取自 `location.origin`），沒有私人結果或權杖。系統支援檔案分享時使用 Web Share，否則下載並提供文字；沒有自動發文。
- Collector 指令預設最近 60 個本地日（當地 00:00 到現在）、IANA 時區、所有支援且本人所有／主機允許存取的本機來源、Tokscale。一次說明並取得範圍與傳送授權，仍遵守主機原生核准。缺少工具、拒絕或一次安裝失敗時繼續現有證據，不捏造用量。

## 卡面稀有度

等級決定外框：未知與 LV0–1 一般、LV2–3 稀有（虹彩外框、四角星芒）、LV4 史詩（再加星點與虹彩徽章）、LV5 傳說（金框）。下載的 PNG 與預覽一致；預覽時史詩與傳說卡另有一道光沿邊框繞行。選擇只顯示暱稱時，等級與稀有度一起隱藏。

## 驗證與限制

執行 `npm run typecheck`、`npm test`、`npm run verify:art`、`npm run test:browser`、`node scripts/smoke-built.mjs http://127.0.0.1:5188`。`test:browser` 會沿用 5188 上已啟動的 preview，否則自行建置、套用本機 migration 後啟動。測試只使用隔離 Chrome、專用虛構資料、本機 D1 與 Turnstile 測試金鑰；每個模擬訪客帶不同的 `CF-Connecting-IP`。HTTP smoke 限 loopback。

測試與驗證腳本的輸出寫到 `evidence/`，不納入版本控制。

本專案交付的是 Agent 指令和最小摘要驗證／提交協定。網站本身不掃描紀錄。`collect.py` 在時間預算內抽樣本地日誌，供合作風格分類。抽樣順序由每個檔案路徑的雜湊決定，同一批紀錄重跑會讀到同一批 session，新紀錄只會逐步替換，重測結果因此比較穩定（分類仍由 Agent 判讀，換模型仍可能有差異）。token 取自 Tokscale 的 client／model 總量。它不算完整會話數。24 個 task、48 個 MBTI observation、64 個成果 observation、24 KiB 是上傳限制，不是模型讀取紀錄的成本上限。

圖片是 ApprenTice 同人衍生，角色參考 ZipZipPipe；DeepSeek 另含上善無形。CC BY-NC-SA 4.0：非商業、署名及相同方式分享。GPT 龍娘是 Codex 主題改編，並非官方角色；上游權利鏈未全面核實，沒有模型業者背書。[素材來源](public/art-provenance.md)。

真人證據校準、動畫匯出尚未完成。資料過期後拒絕讀寫，於後續請求清理；沒有宣稱到期瞬間背景刪除。

網站素材採原尺寸 WebP（品質 98、透明度一致），原始 PNG 全數保存在 `art-source/`。編碼、來源 hash 與素材大小的取捨見 [ART-DELIVERY](docs/ART-DELIVERY.md)。
