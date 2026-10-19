import type {ReactNode} from "react";
import {compareAssessments} from "../lib/compare.ts";
import type {Assessment} from "../lib/contract.ts";
import type {Translate} from "../lib/i18n.ts";

// Four rows, one per axis: both letters and what that pairing means when the two lead agents together.
export function CompareView({t, mine, theirs, children}: {t: Translate; mine: {label: string; assessment: Assessment}; theirs: {label: string; assessment: Assessment}; children?: ReactNode}) {
  const result = compareAssessments(mine.assessment, theirs.assessment);
  return <section className="compare-view" aria-label={t("你和 {nickname}", {nickname: theirs.label})}>
    <p className="compare-kind"><b>{t(result.kind)}</b>{result.known >= 2 && <span>{t("{same} / {known} 軸相同", {same: result.same, known: result.known})}</span>}</p>
    <ol className="compare-rows">
      <li className="compare-head" aria-hidden="true"><span/><span className="compare-letters"><em>{mine.label}</em><i/><em>{theirs.label}</em></span></li>
      {result.axes.map((row) => <li key={row.axis} className={"compare-row " + row.status}>
        <span className="compare-axis">{t(row.name)}</span>
        <span className="compare-letters"><b>{row.mine}</b><i aria-hidden="true">{row.status === "same" ? "=" : row.status === "diff" ? "≠" : "·"}</i><b>{row.theirs}</b></span>
        <p>{t(row.line)}</p>
      </li>)}
    </ol>
    {children}
  </section>;
}
