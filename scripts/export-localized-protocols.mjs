import fs from "node:fs/promises";
import copy from "../lib/collector-copy.json" with {type:"json"};
import extra from "../lib/collector-protocol-extra.json" with {type:"json"};
import {translator} from "../lib/i18n.ts";
import {behaviorLetters,letterLabels} from "../lib/workstyle.ts";
for(const locale of ["zh-CN","ja","ko","en"]){
  const t=translator(locale),text=copy[locale];
  const blocks=[text.intro,...extra[locale].slice(0,1),text.scope,text.grant,text.fields,text.analyze,text.tokscaleRules,text.evidence,text.axes,text.usage,...extra[locale].slice(1,6),text.progress,text.submit,text.retry,text.renew,text.complete,text.remote,...extra[locale].slice(6)];
  const params={origin:"",id:"{id}",token:"WRITE_TOKEN",protocol:"/collector/"+locale+".md"};
  const table=Object.entries(behaviorLetters).map(([code,letter])=>letter+" | "+code+" | "+t(letterLabels[letter])).join("\n");
  const body="# "+t("你的 Agent MBTI")+" · Collector version 2.0\n\n"+blocks.map(p=>p.replace(/\{(origin|id|token|protocol)\}/g,(_,key)=>params[key])).join("\n\n")+"\n\naxis | behavior | "+t("觀察依據與 16 種風格")+"\n---|---|---\n"+table+"\n\nMyers & Briggs Foundation: [preferences](https://www.myersbriggs.org/my-mbti-personality-type/the-mbti-preferences/) · [16 codes](https://www.myersbriggs.org/my-mbti-personality-type/the-16-mbti-personality-types/)\n";
  await fs.mkdir("public/collector",{recursive:true});
  await fs.writeFile("public/collector/"+locale+".md",body);
}
