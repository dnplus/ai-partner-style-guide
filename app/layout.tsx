import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LocaleProvider } from "../components/locale-provider.tsx";
export const metadata: Metadata = {
  title: "你的 AI 夥伴風格指南｜讓合作長出自己的風格",
  description: "以授權紀錄觀察合作風格，取得專屬角色卡。並非人格測驗。",
  referrer: "no-referrer",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#f5f3fa" };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="zh-TW" suppressHydrationWarning><body><LocaleProvider>{children}</LocaleProvider></body></html>;
}
