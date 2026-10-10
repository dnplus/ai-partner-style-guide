import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "你的 Agent MBTI｜讓合作長出自己的風格",
  description: "你怎麼帶它做事，它就長出怎樣的工作風格。授權紀錄在本機分析，你確認摘要後揭曉 Agent 工作風格與專屬角色卡。非官方 MBTI 評量。",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="zh-Hant-TW"><body>{children}</body></html>;
}
