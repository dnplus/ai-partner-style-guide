import {CREATOR} from "../lib/creator.ts";
import type {Translate} from "../lib/i18n.ts";

// The maker's credit; a plain anchor so it renders the same on server pages and in the client app.
export function CreatorLinks({t}: {t: Translate}) {
  return <p className="creator-links"><a href={CREATOR.site} target="_blank" rel="noopener">{t("由 {name} 製作", {name: CREATOR.name})}</a></p>;
}
