import {InfoShell,Cta,JsonLd} from '../../components/info-shell.tsx';
import {translator} from '../../lib/i18n.ts';
import {localeFor,localized} from '../../lib/site-content.ts';
import {infoMetadata} from '../../lib/info-metadata.ts';
import {requestOrigin} from '../../lib/request-origin.ts';
import {personas,artFor} from '../../lib/catalog.ts';
import {axisDefinitions,letterLabels} from '../../lib/workstyle.ts';
import {observedLines} from '../../lib/assessment.ts';
import {typeCodes} from '../../lib/contract.ts';

type Props={searchParams:Promise<{lang?:string}>};
export const dynamic='force-dynamic';
export async function generateMetadata({searchParams}:Props){
 const locale=localeFor((await searchParams).lang),t=translator(locale);
 return infoMetadata('/types',locale,t('16 種帶 Agent 的方式')+'｜'+t('你的 AI 夥伴風格指南'),t('每一型描述的是你帶 Agent 的方式，不是你的人格，也不是模型的性格。'));
}
export default async function TypesPage({searchParams}:Props){
 const locale=localeFor((await searchParams).lang),t=translator(locale),base=await requestOrigin();
 return <InfoShell locale={locale} path="/types">
  <h1>{t('16 種帶 Agent 的方式')}</h1>
  <p className="info-lead">{t('每一型描述的是你帶 Agent 的方式，不是你的人格，也不是模型的性格。')}</p>
  <Cta locale={locale}/>
  <section><h2>{t('四個面向')}</h2><dl className="info-axes">{axisDefinitions.map(axis=><div key={axis.id}><dt>{t(axis.name)}</dt>{[axis.left,axis.right].map(letter=><dd key={letter}><b>{letter} · {t(letterLabels[letter])}</b>{t(observedLines[letter])}</dd>)}</div>)}</dl></section>
  <section><h2>{t('16 種類型')}</h2><ul className="info-types">{typeCodes.map(code=><li key={code}><a href={localized('/types/'+code.toLowerCase(),locale)}><img src={artFor('codex',code,'chibi')!} alt="" loading="lazy" width={120} height={180}/><b>{code}</b><span>{t(personas[code].name)}</span><small>{t(personas[code].line)}</small></a></li>)}</ul></section>
  <JsonLd data={{'@context':'https://schema.org','@type':'DefinedTermSet','name':t('16 種帶 Agent 的方式'),'url':base+localized('/types',locale),'hasDefinedTerm':typeCodes.map(code=>({'@type':'DefinedTerm','termCode':code,'name':code+' '+t(personas[code].name),'description':t(personas[code].line),'url':base+localized('/types/'+code.toLowerCase(),locale)}))}}/>
 </InfoShell>;
}
