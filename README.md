# 你的 Agent MBTI

你怎麼帶它做事，它就長出怎樣的工作風格。這是一個以本人授權紀錄為依據的 Agent 合作風格觀察：命名 → 建立短效連結 → 一次確認來源、期間及最小摘要傳送 → 自己的 Agent 本機分析、驗證與自動提交 → callback 揭曉 → 收藏一般／Q 版角色卡與下載 PNG。

**填 Email 且同意本次結果用途，才開放完整報告；不填只有卡片。** 本機版沒有寄信服務，畫面明示未寄送。Email 不交給 collector，不進報告、卡片或網址。

## 本機啟動

專案路徑：/Users/dnplus/Documents/Codex/2026-10-10/task-2/ai-usage-card

此 Air 已安裝依賴，並套用 0000、0001、0002 三個本機 D1 migration。Node 26.7.0。執行 npm run dev -- --hostname 127.0.0.1 --port 5188，開啟 http://127.0.0.1:5188 。

首頁只有「開始觀察」。頁尾「關於這份觀察」內可選「使用虛構資料體驗」，一次範圍同意後走相同的本機 callback；不讀私人紀錄。

建置：npm run build。建置後預覽：npm start -- --port 5188，請先停止同 port 的 dev server。Sites 官方建置入口與平台資訊見 [Sites starter](docs/SITES-STARTER.md)。

全新複製的工作區先 npm run install:ci、建置，再依序僅一次套用各 pending SQL：
- node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_quick_devos.sql
- node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_new_kinsey_walden.sql
- node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_worthless_bloodstrike.sql

不要重播已套用的 migration。這些命令只修改本機預覽資料庫，不部署、不修改雲端資料。

## 新版規則與資料

完整結果使用標準 16 代碼，但 Agent 行為類比、門檻、中文稱號、描述均為本專案原創。非官方 MBTI 評量，不推斷人的心理人格或模型固定性格。

- E/I：互動共創／整理後交付。
- S/N：具體事實起步／模式與可能性起步。
- T/F：合理方案衝突時，一致準則／受影響者情境取捨。
- J/P：先定路線／以可逆實驗收斂。

同一獨立任務在一軸只算一次；主人要求與實際行為分列。受限、可選性不明、已知要求不符的觀察不計入。勝方至少獲三個獨立 task 支持，佔有效 task（含 mixed）至少三分之二且兩端差至少二個 task，才選方向。這是保守啟發式門檻，不是準確率或性格強度。不足或接近時保留未知，不強行定型；模型、工具與 tokens 不影響結果。

[設計與規則](docs/DESIGN-MBTI.md)、[collector 協定](public/collector-protocol.md)、[空白模板](public/collector-template.json)、[JSON schema](public/collector-schema.json)、[虛構 INTJ 範例](fixtures/intj-workstyle.json)、[部分未知範例](fixtures/partial-workstyle.json)、[完全未知範例](fixtures/insufficient-evidence.json)。

schema 2.0 移除舊等級和舊型別。既有資料保留但不轉型，已授權舊會話回 410 reassessment_required；仍能刪除。瀏覽器改用新儲存命名空間，不重新顯示舊結果。歷史來源與 MIT 法律聲明保留於 [第三方聲明](THIRD_PARTY_NOTICES.md) 和 vendor；前台不再使用舊規則或介紹舊產品。

## 已實作

- Sites 官方 Vite plugin、React/Vinext、D1 持久會話；30 分鐘效期，讀寫分離的 256-bit capabilities，只存 SHA-256。
- 一次提交、原 key／原 JSON 可冪等重試；原子更新、嚴格 JSON、24 KiB 上限、未知欄位拒絕、跨欄位與觀察一致性校驗、日期與來源驗證。
- 後端 Email 報告 gate；不填只有最小卡片資料，無使用統計／日期／任務證據。若平台提供身份則綁定讀取。沒有公開分享網址。
- 單一焦點逐步 UI、返回、等待、暫時斷線重試、重整復原、取消刪除、到期恢復。讀取權杖留 sessionStorage；寫入權杖只留記憶體。
- CSS 3D 厚度、柔影、角度虹彩、選擇性 foil 與角色深度；桌面拖曳、手機觸控、方向鍵、reduced-motion 靜態卡。
- 六家族 × 一般／Q 版，共 12 張通用造型；選主題不改分型，並非 192 張不同型別插圖。所有素材 bytes 保持不變，見 [中性命名與 SHA-256](docs/ASSET-VERIFICATION-MBTI.json)。
- 1080 × 1620 PNG；可只顯示暱稱，預設開啟。未知結果寫「未定型」，不輸出虛假的完整型別。
- 一次來源／日期／欄位／目的地授權後自動驗證及提交，主機必要核准仍保留。範圍驗證、原內容重試與明確換目的地 grant 見 lib/collector-runner.ts。
- 真實階段訊號，90 秒沒有新訊號顯示未知；主機核准只顯示 Agent 明確回報。到期保留本機最小摘要，換新連結需明確授權，不延長效期。
- 使用者另有要求才使用本機離線 JSON 預覽 CLI：node scripts/review-collector.ts --approved-input fixtures/collector-review-input.json 新預覽.json。它不讀會話、不使用網路，保持提交同意 false；不是正常流程的第二次確認門檻。

圖片為 ApprenTice 同人衍生，角色參考 ZipZipPipe，DeepSeek 加上善無形。CC BY-NC-SA 4.0，非官方、非商業；上游權利鏈尚未全面核實。GPT 龍娘是 Codex 主題改編，非官方 Codex 角色。詳見 [素材來源](public/art-provenance.md)；原始生成記錄存於 docs/ART-PROVENANCE.md。

## 驗證與限制

執行 npm run typecheck、npm test、npm run test:browser、node scripts/smoke-built.mjs http://127.0.0.1:5188 。瀏覽器測試只使用此 Air 的隔離 Chrome 與專用範例；API smoke 僅接受 loopback。

最新 C4 的 [流程交付記錄](docs/DELIVERY-FLOW.md) 與 evidence/agent-mbti-flow/ 是本版證據。C3 的 [MBTI 交付記錄](docs/DELIVERY-MBTI.md)、[視覺 QA](docs/FIDELITY-MBTI.md) 留存規則重設的驗證。docs/DELIVERY.md、docs/DELIVERY-GUIDED.md 及較舊 evidence 是歷史版本，保留供稽核，不代表目前產品。

未部署、push、merge、公開網站、登入、申請憑證、寄信或讀真人紀錄。私人 Sites 閘門下的外部 callback 尚未驗證；本機 HTTP 成功不代表遠端可用。下一步需在獲授權的目的地驗證精確 callback 路徑，不能分享整站 bypass key 或更改公開權限。

真人證據校準、動畫匯出、寄信仍未完成；不因此阻擋本機核心。資料到期即拒絕讀寫，於下一次請求清理，沒有宣稱到期瞬間背景清除。結果可暫留瀏覽器記憶體；重新整理無法取回已到期資料。Library 本機上傳通道先前不可用，目前交付為本機檔案，沒有新的 Library IDs。
