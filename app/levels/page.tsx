import {InfoShell,Cta} from '../../components/info-shell.tsx';
import {translator} from '../../lib/i18n.ts';
import {localeFor} from '../../lib/site-content.ts';
import {infoMetadata} from '../../lib/info-metadata.ts';
import {levelNames,levelDescriptions,usageBases,nextSteps} from '../../lib/usage-level.ts';

type Props={searchParams:Promise<{lang?:string}>};
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:Props){
 const locale=localeFor((await searchParams).lang),t=translator(locale);
 return infoMetadata('/levels',locale,t('使用等級 LV0–5')+'｜'+t('你的 AI 夥伴風格指南'),t('等級和類型無關，也不看用量或模型；沒有證據時保持未知，不會當成 LV0。'));
}
export default async function LevelsPage({searchParams}:Props){
 const locale=localeFor((await searchParams).lang),t=translator(locale);
 return <InfoShell locale={locale} path="/levels">
  <h1>{t('使用等級 LV0–5')}</h1>
  <p className="info-lead">{t('等級和類型無關，也不看用量或模型；沒有證據時保持未知，不會當成 LV0。')}</p>
  <Cta locale={locale}/>
  <ol className="info-levels">{levelNames.map((name,level)=><li key={name}><h2>LV {level} · {t(name)}</h2><p>{t(levelDescriptions[usageBases[level]])}</p><p className="info-tip">{t('下一步')}：{t(nextSteps[level as 0])}</p></li>)}</ol>
 </InfoShell>;
}
