import copy from "./collector-copy.json" with {type:"json"};
import {localizedProtocol,type Locale} from "./i18n.ts";
import {createCollectorScope,formatScopeWindow,scopeDateBounds,SESSION_TTL_MS,collectorScopeSchema,type CollectorScope} from "./collector-scope.ts";

export type LocalSession={id:string;readToken:string;writeToken?:string;expiresAt:number;nickname:string};
export function collectorConfirmation(scope:CollectorScope,locale:Locale="zh-TW"){
  const text=copy[locale];
  const sources=scope.options.sourceMode==="all_supported_local"?text.allSources:text.selectedSources.replace("{sources}",scope.options.sources.join(", "));
  const tokscale=scope.options.includeTokscale?(scope.options.installTokscaleIfMissing?text.tokscaleInstall:text.tokscaleExisting):text.tokscaleDisabled;
  const params:Record<string,string>={sources,days:String(scope.options.lookbackDays),window:formatScopeWindow(scope,locale),tokscale};
  return text.confirmation.replace(/\{(sources|days|window|tokscale)\}/g,(_,key:string)=>params[key]);
}
export function collectorInstructions(session:LocalSession,origin:string,resume=false,locale:Locale="zh-TW",inputScope?:CollectorScope){
  const text=copy[locale];
  const scope=collectorScopeSchema.parse(inputScope??createCollectorScope(session.expiresAt-SESSION_TTL_MS));
  const dates=scopeDateBounds(scope);
  const params:Record<string,string>={origin,id:session.id,nickname:JSON.stringify(session.nickname),expires:new Date(session.expiresAt).toISOString(),protocol:origin+localizedProtocol(locale),token:session.writeToken??"[WRITE_TOKEN_UNAVAILABLE]",confirmation:collectorConfirmation(scope,locale),sourceMode:scope.options.sourceMode,sources:scope.options.sources.join(","),days:String(scope.options.lookbackDays),from:scope.from,to:scope.to,timeZone:scope.timeZone,since:dates.from,until:dates.to,includeTokscale:String(scope.options.includeTokscale),installTokscaleIfMissing:String(scope.options.installTokscaleIfMissing)};
  const order=[text.intro,text.destination,text.read,text.scope,resume?text.renew:text.grant,text.fields,text.analyze,text.tokscaleRules,text.evidence,text.axes,text.progress,text.submit,text.retry,text.complete,text.local];
  return order.map(paragraph=>paragraph.replace(/\{([a-zA-Z]+)\}/g,(match,key:string)=>params[key]??match)).join("\n\n");
}
