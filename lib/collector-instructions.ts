import copy from "./collector-copy.json" with {type:"json"};
import {localizedProtocol,type Locale} from "./i18n.ts";

export type LocalSession={id:string;readToken:string;writeToken?:string;expiresAt:number;nickname:string};
export function collectorInstructions(session:LocalSession,origin:string,resume=false,locale:Locale="zh-TW"){
  const text=copy[locale];
  const params:Record<string,string>={origin,id:session.id,nickname:JSON.stringify(session.nickname),expires:new Date(session.expiresAt).toISOString(),protocol:origin+localizedProtocol(locale),token:session.writeToken??"[WRITE_TOKEN_UNAVAILABLE]"};
  const order=[text.intro,text.destination,text.read,resume?text.renew:text.grant,text.fields,text.analyze,text.evidence,text.axes,text.progress,text.submit,text.retry,text.complete,text.local];
  return order.map(paragraph=>paragraph.replace(/\{(origin|id|nickname|expires|protocol|token)\}/g,(_,key:string)=>params[key])).join("\n\n");
}
