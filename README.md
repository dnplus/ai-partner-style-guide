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

使用標準 16 個 MBTI 代碼作為 Agent 行為類比；合作風格規則、門檻、稱號及描述是本專案的定義，並非心理測驗。

- E/I：互動共創／整理後交付。
- S/N：具體實例起步／模式與可能性起步。查核、測試、除錯本身不等於 S。
- T/F：一致準則／受影響者情境決定取捨。
- J/P：先定路線／以可逆實驗收斂。

同一獨立任務在每軸只算一次，主人要求與實際行為分開記錄。受限、可選性不明或要求不符的觀察不計入。方向需至少 3 個 task 支持、占有效 task（含 mixed）至少 2/3，且兩端差至少 2；不足或接近就保留未知。這些門檻不是準確率。tokens、模型家族與客戶端不參與分型。

**獨立的使用等級 LV0–5** 只根據最小成果證據衍生。沒有證據是未知，不能當 LV0。LV4 需已檢視、測試並於不同任務重用的同一成果；LV5 另外需至少兩條任務互不重疊、持續 14 天以上的流程，以及角色、驗收、例外處理、維護與回饋。等級基於 ai-level-check v0.4.6 的成果觀念，版本固定於 `d262ca67a6efa59ffb0e0a2a2843978a149e047d`，本專案將其實作為保守的 `usage-level-v1` 證據門檻，保留 MIT 署名；不是上游官方認證。

[觀察設計](docs/DESIGN-MBTI.md)、[collector 協定](public/collector-protocol.md)、[空白模板](public/collector-template.json)、[JSON schema](public/collector-schema.json)、[第三方聲明](THIRD_PARTY_NOTICES.md)。schema 2.0 可選 `usageEvidence`；舊 2.0 摘要缺少此欄位時等級保持未知。更早的舊型別不會被偷偷轉成 MBTI。

## 已實作

- Sites 官方 Vite/Vinext、React、D1；會話有效 30 分鐘，讀寫分離的 256-bit 權杖，只存雜湊。所有私人讀取同時要求正確 ChatGPT 帳戶與讀取權限。
- 外部 Agent 的 callback 只需其短效寫入權杖，不能讀取結果。一次原子提交、相同 key／內容可重試；嚴格 JSON、24 KiB 上限、來源／日期／引用與結果一致性驗證。
- 三步流程、真實進度、返回、斷線重試、到期換新目的地；寫入權杖不持久保存。30 分鐘不是掃描耗時保證。
- 最近結果保存最多 7 天，以 HttpOnly、SameSite=Strict、HTTPS Secure 且限 `/api/remembered` 的 Cookie，加上同一登入帳戶讀取。可清除或開始新觀察。localStorage 只有語言偏好；sessionStorage 有短效讀取權限及介面偏好，不含 Email 或原始紀錄。
- 同一套 SVG composition 驅動預覽和 PNG，預設顯示 Agent MBTI、四碼、等級、稱號、暱稱、短句。暱稱模式需明確選取。CSS 3D 厚度、柔影、角度虹彩、選擇性 foil、桌面拖曳／手機觸控／方向鍵；reduced-motion 靜態卡。
- 六家族 × 16 型 × 一般／Q 版，共 192 張不同插畫。換造型不重新判定；未知使用中性卡面。`/art-gallery` 可檢視完整圖庫。
- 繁中、簡中、日文、韓文、英文；流程、指令、報告、等級、分享與下載均隨語言切換。
- 1080×1620 卡片、1080×1350 直式、1080×1920 限時、1080² 正方形、1200×630 橫式 PNG。QR 和文字僅指向測驗首頁，沒有私人結果或權杖。系統支援檔案分享時使用 Web Share，否則下載並提供文字；沒有自動發文。
- Collector 指令預設最近 60×24 小時、IANA 時區、所有支援且本人所有／主機允許存取的本機來源、Tokscale。一次說明並取得範圍與傳送授權，仍遵守主機原生核准。缺少工具、拒絕或一次安裝失敗時繼續現有證據，不捏造用量。

## 驗證與限制

執行 `npm run typecheck`、`npm test`、`npm run verify:art`、`npm run test:browser`、`node scripts/smoke-built.mjs http://127.0.0.1:5188`。測試只使用隔離 Chrome、專用虛構資料和本機 D1。HTTP smoke 限 loopback。

測試與驗證腳本的輸出寫到 `evidence/`，不納入版本控制。發佈與原生登入的實際觀察記在 `docs/DELIVERY-PUBLIC.md`。

本專案交付的是 Agent 指令和最小摘要驗證／提交協定，沒有原始紀錄自動掃描器、語意去重器、context budget 前處理器或掃描 cache。24 個 task、48 個 MBTI observation、64 個成果 observation、24 KiB 是上傳限制，不是模型讀取紀錄的成本上限。沒有在此工作中安裝／執行 Tokscale、掃描真人紀錄或測量真實 collector 效能；[範圍與限制](docs/DELIVERY-DEFAULTS.md) 有詳細說明。

圖片是 ApprenTice 同人衍生，角色參考 ZipZipPipe；DeepSeek 另含上善無形。CC BY-NC-SA 4.0：非商業、署名及相同方式分享。GPT 龍娘是 Codex 主題改編，並非官方角色；上游權利鏈未全面核實，沒有模型業者背書。[素材來源](public/art-provenance.md)。

真人證據校準、動畫匯出、寄信尚未完成。資料過期後拒絕讀寫，於後續請求清理；沒有宣稱到期瞬間背景刪除。

網站素材採原尺寸 WebP（品質 98、透明度一致），原始 PNG 全數保存在 `art-source/`。編碼、來源 hash 與 Sites 封裝限制說明見 [ART-DELIVERY](docs/ART-DELIVERY.md)。
