# C2 單焦點引導體驗

延續 C1 的同一個產品目標；頁面改成依序出現的狀態，不再同時呈現圖鑑、報告、選項與建立會話。

## 固定視覺規格

- 紙色 #f5f3fa、墨色 #1d172d、紫色 #7954ed、主要按鈕萊姆色 #dfff78。
- Songti TC 中文襯線標題，PingFang TC 內文。品牌置中，次頁左上只有返回。
- 第一屏只有標題、真實既有角色卡、開始。說明藏在頁尾次要入口。
- 一般桌面主容器 580px，封面 720px；手機留 25px 邊界。卡片獨立維持透視與 3D 圖層。
- `guided-cover.png`、`guided-identity.png`、`guided-waiting.png` 為這次 UI 視覺目標；畫面中的 UI 全部用 HTML/CSS 實作，沒有把概念圖當整張 UI。角色沿用已驗證的 12 張同人素材。

## 狀態與唯一主操作

| 狀態 | 這一步的主題 | 主要操作 |
| --- | --- | --- |
| cover | 你與 AI 是哪一種搭檔 | 開始／繼續這次觀察 |
| identity | 暱稱；Email 折疊選填 | 建立我的連結 |
| instructions | 把指令交給自己的 Agent | 複製專屬指令 |
| waiting | 真實收件狀態、30 分鐘期限 | 等待自動揭曉；重看指令為次要操作 |
| reveal | 角色卡揭曉 | 有 Email 看觀察；無 Email 收藏卡 |
| summary | 僅 Email 路徑可讀完整報告 | 收藏我的卡片 |
| collection | 同一觀察切換卡面並下載 | 下載 PNG |
| fixture | 次要範例入口中的摘要預覽 | 核准後送出虛構摘要 |

## 使用者新規則

Email 不填只有卡片。不是用 CSS 隱藏：GET session 對未填 Email 的會話只回傳 nickname、kind、assessment、modelFamily，`report` 固定 null。填 Email 且同意只用於此次結果才可取得完整報告。此版本無寄信服務，`delivery=not_configured`，UI 明示未寄送。不能把可查看完整報告說成已收到 Email。

## 恢復與授權

返回保留同一次會話，不建立重複連結。重新整理只保存讀取權杖，提交權杖不持久保存。等待只顯示是否收到摘要，不假裝知道 Agent 分析進度。斷線退避重試、到期停止等候、新連結撤銷舊權限。兩次 Agent 授權維持原協定：讀紀錄前、最小 JSON 提交前。
