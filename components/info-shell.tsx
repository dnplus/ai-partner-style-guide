import Link from "next/link";
import type {ReactNode} from "react";
import {translator, locales, localeNames, type Locale} from "../lib/i18n.ts";
import {localized} from "../lib/site-content.ts";

// Server-rendered frame for the public pages: plain links for crawlers, one language per URL, the disclaimer on every page.
export function InfoShell({locale, path, children}: {locale: Locale; path: string; children: ReactNode}) {
  const t = translator(locale);
  const nav: [string, string][] = [["/types", "16 種類型"], ["/levels", "使用等級"], ["/method", "怎麼判斷"], ["/art-gallery", "插畫圖庫"]];
  return <div className="info-root" lang={locale}>
    <header className="info-header">
      <Link className="brand" href={localized("/", locale)}><span aria-hidden="true">✧</span>{t("你的 Agent MBTI")}<span aria-hidden="true">✧</span></Link>
      <nav aria-label={t("網站導覽")}>{nav.map(([href, label]) => <Link key={href} href={href === "/art-gallery" ? href : localized(href, locale)} aria-current={path === href ? "page" : undefined}>{t(label)}</Link>)}</nav>
    </header>
    <main className="info-page">{children}</main>
    <footer className="info-footer">
      <nav aria-label={t("語言")}>{locales.map((l) => <Link key={l} href={localized(path, l)} hrefLang={l} aria-current={l === locale ? "true" : undefined}>{localeNames[l]}</Link>)}</nav>
      <p>{t("非官方 MBTI 評量。MBTI 是 The Myers-Briggs Company 的註冊商標，本站與其無關；類型、規則與文案皆為本專案自訂。")}</p>
    </footer>
  </div>;
}
export function Cta({locale}: {locale: Locale}) {
  return <Link className="primary info-cta" href={localized("/", locale)}>{translator(locale)("測測你的 Agent 是哪一型")}</Link>;
}
export function JsonLd({data}: {data: unknown}) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(data).replace(/</g, "\\u003c")}}/>;
}
