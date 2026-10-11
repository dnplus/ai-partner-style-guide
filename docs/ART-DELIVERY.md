# 網站素材編碼

已確認的 204 張原始 PNG（192 張分型插畫與 12 張早期人物圖）保存在 `art-source/`；`art-source/manifest.json` 保留原先 192 張的檔名與 SHA-256。授權、角色來源與非官方聲明沿用現有來源文件。

原 PNG 封裝為 517,321,023 bytes；無損 WebP 的 192 張插畫仍為 280,688,232 bytes，對首頁與圖庫載入都太重（最初的託管平台另有 256 MiB 封裝上限；Workers 靜態資源則限單檔 25 MiB）。因此正式網站使用原尺寸的 WebP，品質 98、alpha 品質 100，未裁切、縮放或重新生成角色。這是有損色彩編碼，透明度逐像素驗證一致。下載成品仍為指定尺寸的 PNG。

`node scripts/prepare-art-delivery.mjs` 從原始 SHA-256 驗證過的 PNG 重新產生網站 WebP、更新 runtime manifest 與 `evidence/published/art-encoding.json`。編碼紀錄包含每張的來源／交付 hash、原尺寸、透明度一致性與可見色彩平均誤差。`node scripts/verify-art.mjs` 檢查 192 個唯一檔案與解碼像素；可用 `ART_VERIFY_OUTPUT` 指定本次證據路徑。

`art-source/` 是可重建來源，不是網站公開檔案。只有 `public/art/mbti/` 下的 WebP 進入正式素材封裝。原始 PNG 與 C8 的完整開發歷史保留在主要工作區。
