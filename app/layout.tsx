import type { Metadata } from "next";
import "./globals.css";
import { LocaleProvider } from "../components/locale-provider.tsx";
export const metadata: Metadata = {
  title: "你的 Agent MBTI｜讓合作長出自己的風格",
  description: "以授權紀錄觀察合作風格，取得專屬角色卡。非官方 MBTI 評量。",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="zh-TW" suppressHydrationWarning><body><LocaleProvider>{children}</LocaleProvider></body></html>;
}
