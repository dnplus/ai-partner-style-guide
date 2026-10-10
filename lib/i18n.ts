import messages from "./messages.json" with { type: "json" };

export const locales = ["zh-TW", "zh-CN", "ja", "ko", "en"] as const;
export type Locale = typeof locales[number];
export const localeNames: Record<Locale, string> = { "zh-TW": "繁體中文", "zh-CN": "简体中文", ja: "日本語", ko: "한국어", en: "English" };
export const LOCALE_KEY = "agent-mbti-locale-v1";
export type Params = Record<string, string | number>;
export type Translate = (source: string, params?: Params) => string;
const dictionary = messages as Record<string, string[]>;

export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.toLowerCase().replaceAll("_", "-");
    if (tag === "zh" || tag.startsWith("zh-")) return /(^|-)hans($|-)|(^|-)cn($|-)|(^|-)sg($|-)/.test(tag) ? "zh-CN" : "zh-TW";
    if (/^ja($|-)/.test(tag)) return "ja";
    if (/^ko($|-)/.test(tag)) return "ko";
    if (/^en($|-)/.test(tag)) return "en";
  }
  return "en";
}
export function translate(locale: Locale, source: string, params: Params = {}) {
  const index = locales.indexOf(locale) - 1;
  const template = index < 0 ? source : dictionary[source]?.[index] ?? source;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => Object.hasOwn(params, key) ? String(params[key]) : match);
}
export const translator = (locale: Locale): Translate => (source, params) => translate(locale, source, params);
export const bodyFonts: Record<Locale, string> = {
  "zh-TW": '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif',
  "zh-CN": '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif',
  ja: '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", Arial, sans-serif',
  ko: '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", Arial, sans-serif',
  en: 'Arial, "PingFang TC", "Hiragino Sans", "Apple SD Gothic Neo", sans-serif'
};
export const localizedProtocol = (locale: Locale) => locale === "zh-TW" ? "/collector-protocol.md" : "/collector/" + locale + ".md";

export function noticeText(locale:Locale,source:string) {
  if(!source)return "";
  if(Object.hasOwn(dictionary,source))return translate(locale,source);
  const original=Object.entries(dictionary).find(([,values])=>values.includes(source));
  return translate(locale,original?.[0]??"發生連線或處理錯誤，請再試一次。");
}
