// The site's public address. Links, previews and QR codes take their host from the request,
// so this only decides where requests to the old workers.dev address are sent.
export const SITE_HOST = 'urai.dnplus.dev';

// Pages opened on the old workers.dev address move to the site's own domain, so shared cards and links keep
// working. The API and the collector stay put: an agent mid-run posts to the origin in its prompt, and
// collect.py refuses to follow redirects.
export function siteRedirect(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  if (!url.hostname.endsWith('.workers.dev') || /^\/(api|collector|_next)\//.test(url.pathname)) return null;
  return 'https://' + SITE_HOST + url.pathname + url.search;
}
