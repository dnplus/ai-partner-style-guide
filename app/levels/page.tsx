import {InfoShell,Cta} from '../../components/info-shell.tsx';
import {translator} from '../../lib/i18n.ts';
import {localeFor} from '../../lib/site-content.ts';
import {infoMetadata} from '../../lib/info-metadata.ts';
import {RARITY_LEAD,UNRATED,rarityDescriptions,rarityNames,rarityOrder} from '../../lib/rarity.ts';

type Props={searchParams:Promise<{lang?:string}>};
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:Props){
 const locale=localeFor((await searchParams).lang),t=translator(locale);
 return infoMetadata('/levels',locale,t('卡片稀有度')+'｜'+t('你的 AI 夥伴風格指南'),t(RARITY_LEAD));
}
// The path stays /levels so links shared before the rename keep working.
export default async function RarityPage({searchParams}:Props){
 const locale=localeFor((await searchParams).lang),t=translator(locale);
 return <InfoShell locale={locale} path="/levels">
  <h1>{t('卡片稀有度')}</h1>
  <p className="info-lead">{t(RARITY_LEAD)}</p>
  <Cta locale={locale}/>
  <ol className="info-levels">{[...rarityOrder].reverse().map(r=><li key={r} data-rarity={r}><h2>{t(rarityNames[r])}</h2><p>{t(rarityDescriptions[r])}</p></li>)}<li data-rarity="unrated"><h2>{t(UNRATED)}</h2><p>{t(rarityDescriptions.unrated)}</p></li></ol>
 </InfoShell>;
}
