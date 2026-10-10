# C6 交付：完整五語系

zh-TW、zh-CN、ja、ko、en 已貫穿首頁、命名與 Email 用途、collector 指令及規則、等待／核准／過期復原、揭曉、完整報告、未知證據、收藏、圖庫和 PNG。第一次依瀏覽器語言選擇；頁尾語言選單可手動覆寫並在重新整理後保留。專有名稱、使用者暱稱、型別代碼、API 欄位、URLs 不翻譯。

192 張素材、family + type + style 索引、評估門檻與授權／會話服務未變更。切語言不重測、不另建會話；一次來源／日期／最小摘要／目的地授權流程與原生主機核准仍保留。沒有第二次 JSON 提交確認。Email 空白時，後端只回傳卡片；填 Email 並同意本次結果用途才提供完整報告。本機沒有寄信服務，五語畫面皆明示未寄送。

## 本機驗證

執行環境為 Air 的 Node 26.7.0、Chrome 與 Sites 官方 built Worker + 本機 D1，預覽只綁定 http://127.0.0.1:5188。最後一輪正式瀏覽器15項全數通過，使用者預覽已恢復為繁體中文首頁；已到期的人工示範會話已清除。

| 命令／證據 | 結果與範圍 |
| --- | --- |
| npm run typecheck | 通過；evidence/locales/typecheck-results.txt |
| npm test | 56/56；評估、D1 權限／冪等／到期、collector 一次授權與五語規則；unit-results.txt |
| 官方 Sites build-site.mjs | 成功；build-results.txt |
| node scripts/smoke-built.mjs http://127.0.0.1:5188 | 20/20；built-worker-smoke.json |
| npm run test:browser | 15/15，2.8分鐘；built-browser-run.txt、browser-results.json |
| C5 npm run verify:art | 192/192，192 個不同檔案 SHA256 與解碼像素雜湊；evidence/art-192/verification.json；C6 未改圖片或 manifest |

五語測試各自使用其瀏覽器 locale，依序驗證手動切換與保存、空白暱稱、Email 同意、真實 session、已消去權杖的 collector 指令、主機連線核准訊號、90 秒無新訊號、callback、完整報告、一般／Q 版下載、無 Email 的後端 card-only、部分未知、錯誤及過期換新目的地。另保留原有十項回歸，包含16型經 callback 後核對六家族×兩畫風的192格、手機觸控與 reduced motion。

每個語言實際下載一般、Q 版與暱稱卡，共15張1080×1620 PNG。測試監看 Canvas 的文字與字型，確認 document.fonts 已 loaded、使用語系適用的系統字型、含當地語言的稱號與說明，且不含 Email、會話 ID 或讀取權杖。檔名含語系與當地語言的「角色卡」。collector 證據檔遮蔽寫入權杖與虛構會話 ID。

## 視覺檢視

已檢視五語手機首頁，以及繁中完整報告、簡中指令、英文收藏、韓文主機核准和英文過期畫面。390×844 的內容與操作沒有橫向溢出。已檢視繁中 Q 版、簡中一般、日文一般、韓文 Q 版與英文 Q 版 PNG；中文字形、日文與韓文字形、角色構圖、稱號和底部署名均可讀。192 格的圖庫與個別放大仍使用同一素材索引。

Canvas 先等待各語系字型，再量測長文字縮放以保留邊界；沒有外部字型或翻譯服務。跨作業系統的字型 fallback 已定義，本輪實際驗證限此 Air，不宣稱已在 Windows／Android 實機驗證。

## 失敗與修正記錄

第一輪英文測試以 setFixedTime 固定 Date.now，導致 fastForward 無法走到過期。改用 Playwright setSystemTime，讓到期模擬與應用計時一致。這是測試時鐘修正。

第一輪正式15項測試為14項通過、圖庫數量文字失敗：翻譯改寫時消去插值後的空白。已改為完整模板「{ready} / {total} 張」，保留可翻譯語序，之後停止 runtime、完整重建再重跑，沒有在舊 server 還使用 dist 時重建。

最後重啟後首次 HTTP smoke 的無效摘要請求曾回503而非預期422。隨後四個專用診斷請求皆穩定回422，完整20項 smoke 也通過。當次回應本文未保存，不能確定原因，也不算成功紀錄；沒有據此變更資料庫或放寬驗證。專用診斷會話已刪除。最終完整瀏覽器驗證另列於上表。

## 尚未驗證的外部能力

沒有部署、push、merge、公開存取、寄信、登入、新憑證或真人紀錄掃描。外部 Agent 穿越私人 Sites 閘門的 callback 尚未驗證，本機成功不能代表遠端可用；不分享整站 bypass key。真實寄送與真人證據校準仍需後續獲授權環境。動畫匯出未實作；PNG 核心已完成。

素材沿用 C5 的同人署名與 CC BY-NC-SA4.0 非商業／相同方式分享條件，上游權利鏈仍未全面確認，無官方背書。Codex 為 GPT 娘同人適配。歷史來源、Library IDs、SHA256 和選圖紀錄保留於 docs/art-192，沒有重新生成或替換素材。
