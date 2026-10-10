import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AI 人物誌｜你的 AI 使用風格，專屬角色卡",
  description: "從你授權的真實使用紀錄，觀察六個等級與十六種風格。紀錄留本機，摘要經你確認才回傳。非心理測驗、非官方同人企劃。",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="zh-Hant-TW"><body>{children}</body></html>;
}
