"use client";

import {localSources,type ScopeOptions} from "../lib/collector-scope.ts";
import {useLocale} from "./locale-provider.tsx";

export function CollectorScopeOptions({value,onChange,timeZone}:{value:ScopeOptions;onChange:(value:ScopeOptions)=>void;timeZone:string}){
  const {t}=useLocale();
  return <div className="collector-scope-options">
    <p className="scope-defaults">{t("最近 {days} 天 · {sources} · {tokscale}",{days:value.lookbackDays,sources:t(value.sourceMode==="all_supported_local"?"所有支援本機來源":"已選來源"),tokscale:value.includeTokscale?"Tokscale":t("不含 Tokscale")})}</p>
    <details><summary>{t("進階範圍（選填）")}</summary><div className="scope-fields">
      <label>{t("觀察天數")}<input aria-label={t("觀察天數")} type="number" min={1} max={365} value={value.lookbackDays} onChange={e=>onChange({...value,lookbackDays:Number(e.target.value)})}/></label>
      <label>{t("來源範圍")}<select value={value.sourceMode} onChange={e=>onChange({...value,sourceMode:e.target.value as ScopeOptions["sourceMode"]})}><option value="all_supported_local">{t("所有支援本機來源")}</option><option value="selected">{t("自行選取")}</option></select></label>
      {value.sourceMode==="selected"&&<fieldset><legend>{t("已選來源")}</legend>{localSources.map(source=><label className="check-field" key={source}><input type="checkbox" checked={value.sources.includes(source)} onChange={e=>onChange({...value,sources:e.target.checked?[...value.sources,source]:value.sources.filter(s=>s!==source)})}/>{source==="other"?t("其他已支援的本機工具"):source}</label>)}</fieldset>}
      <label className="check-field"><input type="checkbox" checked={value.includeTokscale} onChange={e=>onChange({...value,includeTokscale:e.target.checked})}/>{t("包含 Tokscale 彙總")}</label>
      {value.includeTokscale&&<label className="check-field"><input type="checkbox" checked={value.installTokscaleIfMissing} onChange={e=>onChange({...value,installTokscaleIfMissing:e.target.checked})}/>{t("缺少時安裝官方 Tokscale 套件")}</label>}
      <p>{t("時區：{zone}",{zone:timeZone})}</p><p>{t("只限本人所有、主機允許讀取的支援紀錄。不會掃整顆磁碟或憑證。")}</p>
    </div></details>
  </div>;
}
