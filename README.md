# AI 人物誌

本機可運作的 AI 使用習慣觀察卡：建立短效會話 → 交給自己的 Agent → 本機分析後預覽 JSON → 經本人確認回傳 → 揭曉角色卡（填 Email 才可取得完整報告）→ 一般與 Q 版切換 → 下載 PNG。

這是依行為證據整理的期間觀察，不是經驗證的心理測驗。缺乏證據保留 unknown／?，不以 tokens 升級，也不預設任何真人的 LV4+ 或 PVSE/QVSE 結論。

## 在這台 Air 啟動

此工作區已安裝依賴並套用本機 D1 migration。使用 Node 26.7.0 驗證；不需登入或雲端憑證。

```sh
cd /Users/dnplus/Documents/Codex/2026-10-10/task-2/ai-usage-card
npm run dev -- --hostname 127.0.0.1 --port 5188
```

開啟 http://127.0.0.1:5188 。首頁只有「開始觀察」：暱稱 → 交給 Agent → 等待 → 揭曉 → 收藏。完整說明及「使用虛構資料體驗」在頁尾次要入口；範例仍先預覽 JSON、勾選確認，再送出到同一套本機 callback。這不會讀取你的紀錄。

要預覽建置後的 Worker：

```sh
npm run build
npm start -- --port 5189
```

全新複製的工作區，先 `npm run install:ci`、`npm run build`，再僅一次套用 schema：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_quick_devos.sql
```

不要對已建立的資料庫重播 migration。本機狀態在忽略版控的 `.wrangler/state`；這個命令不修改雲端資料庫。Sites 原始啟動／平台說明保留於 [docs/SITES-STARTER.md](docs/SITES-STARTER.md)。

## 已完成

- React/Vinext + Sites 官方 Vite plugin；D1 持久會話與 expiring read/write capabilities。
- 30 分鐘效期，兩組獨立 256-bit 權杖，只存 SHA-256；讀取權限留在 sessionStorage，提交權限只留記憶體。網址無暱稱、Email 或權杖。
- 每個會話只收一份結果；原 key、原 JSON 可重試；原子條件更新防覆寫。嚴格 schema、24 KiB 上限、來源／證據／評級一致性驗證、跨來源拒絕、平台使用者 ID 綁定（如有）。
- 暱稱必填；Email 選填且須同意本次結果用途。不填只回傳卡片欄位，後端不開放完整報告；填了才可查看完整報告。本機尚無寄信服務，狀態明示 not_configured；Email 不給 collector，也不出現在報告／PNG。
- 四軸、級別、觀察期間、覆蓋與缺口、人類／自動化／子代理計數、模型家族和客戶端分列。網站能驗證規則一致性，不能替代原始證據真實性審查。
- CSS 3D 的厚度、陰影、角度虹彩、選擇性 foil、背景／角色／文字深度；滑鼠、觸控、方向鍵與 reduced-motion 靜態版。
- 六家族共 **12 張 PVSE** 插圖，一般／Q 版共享檢視器與評估。16 型風格說明收在次要入口；192 個規劃位置中其餘 180 張誠實標示待製作。
- 1080 × 1620 PNG，預設只顯示暱稱模式，均保留署名與非官方／非商業說明。

## Collector 與來源

- [回傳協定](public/collector-protocol.md)、[空白 JSON](public/collector-template.json)、[機器可讀 schema](public/collector-schema.json)、[虛構 PVSE 範例](fixtures/pvse-lv4-plus.json)、[證據不足範例](fixtures/insufficient-evidence.json)。Agent 先確認閱讀來源／期間，再在回傳前取得第二次明確同意。
- 框架 [Raymondhou0917/ai-level-check](https://github.com/Raymondhou0917/ai-level-check/tree/d262ca67a6efa59ffb0e0a2a2843978a149e047d)，v0.4.6，MIT；固定 commit `d262ca67a6efa59ffb0e0a2a2843978a149e047d`。原始 SKILL、levels、personas、evidence-rules 與 LICENSE 保留於 `vendor/ai-level-check`。
- LV5 的 2 獨立流程／3 次執行／7 天，是本網站對持續性採取的保守門檻，並非上游明定的數字。完整差異見協定。
- [素材來源、Library IDs 與授權](docs/ART-PROVENANCE.md)、[逐檔 alpha／SHA-256](docs/ASSET-VERIFICATION.json)。ApprenTice／ZipZipPipe；DeepSeek 加上善無形。依可授權範圍使用 CC BY-NC-SA 4.0；上游權利鏈尚未完整核實。GPT 龍娘是 Codex 主題同人改編，並非官方 Codex 角色。

## 驗證

```sh
npm run typecheck
npm test
npm run test:browser
node scripts/smoke-built.mjs
```

`test:browser` 預期 5188 的 dev server，使用此 Air 上的 Chrome，在獨立測試環境執行；`smoke-built.mjs` 預期 5189 的建置後 Worker，僅接受 loopback URL。專用測試資料完成後刪除；不讀使用者會話。

實測結果：**28 項 Node/D1 測試、6 項 Chrome 流程測試（dev 與建置後均通過）、17 個建置後 Worker 檢查**，TypeScript 與 Sites build 成功。詳見 [C2 交付／驗證記錄](docs/DELIVERY-GUIDED.md)、[單步視覺對照](docs/FIDELITY-GUIDED.md) 和 `evidence/guided/` 截圖；`docs/DELIVERY.md` 與根層 evidence 是前一版 C1 的歷史紀錄。

## 尚未完成的外部條件

未部署、push、merge、公開網站、登入、申請憑證、寄信或讀取真人紀錄。私人 Sites 存取閘門下的外部 callback **尚未驗證**；本機成功不代表遠端成功。下一步需在獲授權的環境驗證精確 callback 路徑，不能分享整站 bypass key 或偷偷公開網站。

尚無其餘 180 張插圖、真人證據校準或動畫匯出。到期即拒絕讀寫，實體資料於下一次請求清理；沒有宣稱到期瞬間背景清除。瀏覽器已顯示的結果可暫留記憶體，重新整理不會取回已到期結果。

離線 JSON 預覽工具與真實資料覆蓋限制見 [Collector 審查記錄](docs/COLLECTOR-VALIDATION.md)。
