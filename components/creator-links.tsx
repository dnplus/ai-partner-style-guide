import {CREATOR} from "../lib/creator.ts";
import type {Translate} from "../lib/i18n.ts";

// The maker's credit; plain anchors so it renders the same on server pages and in the client app.
export function CreatorLinks({t}: {t: Translate}) {
  return <p className="creator-links">
    <span>{t("由 {name} 製作", {name: CREATOR.name})}</span>
    {CREATOR.github && <a href={CREATOR.repo || CREATOR.github} target="_blank" rel="noopener">{t("GitHub 原始碼")}</a>}
    {CREATOR.youtube && <a href={CREATOR.youtube} target="_blank" rel="noopener">{t("YouTube 頻道")}</a>}
  </p>;
}
