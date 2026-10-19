import Link from 'next/link';
import {InfoShell,Cta,JsonLd} from '../../components/info-shell.tsx';
import {translator} from '../../lib/i18n.ts';
import {localeFor,localized,faq,steps,limits} from '../../lib/site-content.ts';
import {infoMetadata} from '../../lib/info-metadata.ts';

type Props={searchParams:Promise<{lang?:string}>};
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:Props){
 const locale=localeFor((await searchParams).lang),t=translator(locale);
 return infoMetadata('/method',locale,t('怎麼判斷的')+'｜'+t('你的 AI 夥伴風格指南'),t(faq[1][1]));
}
export default async function MethodPage({searchParams}:Props){
 const locale=localeFor((await searchParams).lang),t=translator(locale);
 return <InfoShell locale={locale} path="/method">
  <h1>{t('怎麼判斷的')}</h1>
  <p className="info-lead">{t(faq[1][1])}</p>
  <section><h2>{t('三個步驟')}</h2><ol className="info-steps">{steps.map(step=><li key={step}>{t(step)}</li>)}</ol></section>
  <section><h2>{t('四軸怎麼計分')}</h2><p>{t('每段對話每軸選一邊，看不出來就略過。少於 3 票或打平保留問號；勝方佔三分之二以上且差距至少 2 為明確，其餘標成傾向。')} <Link href={localized('/types',locale)}>{t('16 種帶 Agent 的方式')}</Link></p></section>
  <section><h2>{t('使用等級')}</h2><p>{t(faq[3][1])} <Link href={localized('/levels',locale)}>{t('使用等級 LV0–5')}</Link></p></section>
  <section><h2>{t('限制')}</h2><ul>{limits.map(item=><li key={item}>{t(item)}</li>)}</ul><p><a href="/collector/SKILL.md">{t('給 Agent 的完整規則（SKILL.md）')}</a></p></section>
  <section><h2>{t('常見問題')}</h2>{faq.map(([q,a])=><details key={q} className="info-faq" open><summary>{t(q)}</summary><p>{t(a)}</p></details>)}</section>
  <Cta locale={locale}/>
  <JsonLd data={{'@context':'https://schema.org','@type':'FAQPage','mainEntity':faq.map(([q,a])=>({'@type':'Question','name':t(q),'acceptedAnswer':{'@type':'Answer','text':t(a)}}))}}/>
 </InfoShell>;
}
