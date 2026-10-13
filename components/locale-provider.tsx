"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { locales, localeNames, LOCALE_KEY, resolveLocale, translator, bodyFonts, type Locale } from "../lib/i18n.ts";

const LocaleContext = createContext({locale:"zh-TW" as Locale,ready:false,t:translator("zh-TW"),setLocale:(()=>{}) as (locale:Locale)=>void});
export function LocaleProvider({children}:{children:React.ReactNode}) {
  const [locale,setCurrent] = useState<Locale>("zh-TW");
  const [ready,setReady] = useState(false);
  useEffect(()=>{
    let saved:string|null=null;
    try { saved=localStorage.getItem(LOCALE_KEY); } catch {}
    // The saved and browser languages exist only on the client; the app stays inert until this runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrent(locales.includes(saved as Locale) ? saved as Locale : resolveLocale(navigator.languages));
    setReady(true);
  },[]);
  const value = useMemo(()=>({locale,ready,t:translator(locale),setLocale:(next:Locale)=>{
    setCurrent(next);
    try {localStorage.setItem(LOCALE_KEY,next);} catch {}
  }}),[locale,ready]);
  useEffect(()=>{
    if(!ready)return;
    document.documentElement.lang=locale;
    document.documentElement.style.setProperty("--body",bodyFonts[locale]);
    document.title=value.t("你的 AI 夥伴風格指南｜讓合作長出自己的風格");
    document.querySelector('meta[name="description"]')?.setAttribute("content",value.t("以授權紀錄觀察合作風格，取得專屬角色卡。並非人格測驗。"));
  },[locale,ready,value]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export const useLocale=()=>useContext(LocaleContext);
export function LocaleSwitch() {
  const {locale,setLocale,t}=useLocale();
  return <label className="locale-switch"><span aria-hidden="true">◎</span><span className="sr-only">{t("語言")}</span><select aria-label={t("語言")} value={locale} onChange={e=>setLocale(e.target.value as Locale)}>{locales.map(code=><option key={code} value={code} lang={code}>{localeNames[code]}</option>)}</select></label>;
}
