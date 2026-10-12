import {translator} from '../../lib/i18n.ts';
import {personas} from '../../lib/catalog.ts';
import {levelNames,levelDescriptions,usageBases} from '../../lib/usage-level.ts';
import {typeCodes} from '../../lib/contract.ts';
import {faq,steps,limits,siteDescription} from '../../lib/site-content.ts';
// A plain-text map for language models, generated from the same data as the pages so it cannot drift.
export function GET(request:Request){
 const base=new URL(request.url).origin,t=translator('en');
 const text=[`# ${t('你的 Agent MBTI')}`,'',`> ${siteDescription('en')}`,'',
  'It describes how a person leads a coding agent, judged only from the person\'s own messages. It is not an official MBTI assessment and not a personality test. Pages exist in Traditional Chinese (default), Simplified Chinese, Japanese, Korean and English: add ?lang=zh-CN, ?lang=ja, ?lang=ko or ?lang=en.','',
  '## How it works','',...steps.map((s,i)=>`${i+1}. ${t(s)}`),'',
  '## For agents','',`- [Collector skill](${base}/collector/SKILL.md): verify and run collect.py, ask the user once, submit one minimal summary. Transcripts never leave the machine.`,'',
  '## Pages','',`- [The 16 types](${base}/types?lang=en)`,`- [Usage levels LV0–5](${base}/levels?lang=en)`,`- [Method, limits and FAQ](${base}/method?lang=en)`,`- [Art gallery](${base}/art-gallery)`,'',
  '## The 16 types','',...typeCodes.map(code=>`- [${code} — ${t(personas[code].name)}](${base}/types/${code.toLowerCase()}?lang=en): ${t(personas[code].line)}`),'',
  '## Usage levels','',...levelNames.map((name,level)=>`- LV${level} ${t(name)}: ${t(levelDescriptions[usageBases[level]])}`),'',
  '## Limits','',...limits.map(l=>`- ${t(l)}`),'',
  '## FAQ','',...faq.flatMap(([q,a])=>[`### ${t(q)}`,'',t(a),'']),
 ].join('\n');
 return new Response(text,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'}});
}
