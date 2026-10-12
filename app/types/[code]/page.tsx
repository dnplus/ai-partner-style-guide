import Link from 'next/link';
import {notFound} from 'next/navigation';
import {InfoShell,Cta,JsonLd} from '../../../components/info-shell.tsx';
import {translator} from '../../../lib/i18n.ts';
import {localeFor,localized} from '../../../lib/site-content.ts';
import {infoMetadata} from '../../../lib/info-metadata.ts';
import {requestOrigin} from '../../../lib/request-origin.ts';
import {personas,families,artFor} from '../../../lib/catalog.ts';
import {axisDefinitions,letterLabels,letterTips} from '../../../lib/workstyle.ts';
import {observedLines} from '../../../lib/assessment.ts';
import {typeCodes,type TypeCode} from '../../../lib/contract.ts';

type Props={params:Promise<{code:string}>;searchParams:Promise<{lang?:string}>};
export const dynamic='force-dynamic';
const typeOf=(code:string)=>typeCodes.find(c=>c===code.toUpperCase()) as TypeCode|undefined;
export async function generateMetadata({params,searchParams}:Props){
 const type=typeOf((await params).code),locale=localeFor((await searchParams).lang),t=translator(locale);
 if(!type)return {title:t('你的 Agent MBTI')};
 return infoMetadata('/types/'+type.toLowerCase(),locale,`${type} ${t(personas[type].name)}｜${t('你的 Agent MBTI')}`,t(personas[type].line)+' '+[...type].map(letter=>t(observedLines[letter])).join(' '),type);
}
export default async function TypePage({params,searchParams}:Props){
 const type=typeOf((await params).code);if(!type)notFound();
 const locale=localeFor((await searchParams).lang),t=translator(locale),base=await requestOrigin(),path='/types/'+type.toLowerCase();
 return <InfoShell locale={locale} path={path}>
  <p className="info-eyebrow"><Link href={localized('/types',locale)}>{t('16 種帶 Agent 的方式')}</Link></p>
  <h1>{type} · {t(personas[type].name)}</h1>
  <p className="info-lead">{t(personas[type].line)}</p>
  <section><h2>{t('這一型怎麼帶 Agent')}</h2><dl className="info-axes">{axisDefinitions.map((axis,i)=><div key={axis.id}><dt>{t(axis.name)} · {type[i]} {t(letterLabels[type[i]])}</dt><dd>{t(observedLines[type[i]])}</dd><dd className="info-tip">{t(letterTips[type[i]])}</dd></div>)}</dl></section>
  <section><h2>{t('六種角色造型')}</h2><ul className="info-gallery">{families.map(f=><li key={f.id}><img src={artFor(f.id,type,'chibi')!} alt={`${f.label} · ${type}`} loading="lazy" width={150} height={225}/><span>{f.label}</span></li>)}</ul></section>
  <Cta locale={locale}/>
  <section><h2>{t('其他類型')}</h2><p className="info-others">{typeCodes.filter(c=>c!==type).map(c=><Link key={c} href={localized('/types/'+c.toLowerCase(),locale)}>{c} {t(personas[c].name)}</Link>)}</p></section>
  <JsonLd data={[{'@context':'https://schema.org','@type':'DefinedTerm','termCode':type,'name':type+' '+t(personas[type].name),'description':t(personas[type].line),'url':base+localized(path,locale),'inDefinedTermSet':base+localized('/types',locale)},{'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':t('16 種帶 Agent 的方式'),'item':base+localized('/types',locale)},{'@type':'ListItem','position':2,'name':type,'item':base+localized(path,locale)}]}]}/>
 </InfoShell>;
}
