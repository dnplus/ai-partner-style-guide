import {locales} from '../../lib/i18n.ts';
import {typeCodes} from '../../lib/contract.ts';
import {localized} from '../../lib/site-content.ts';
// Public pages only: results, team boards and personal cards never appear here.
export function GET(request:Request){
 const base=new URL(request.url).origin;
 const url=(loc:string,alternates='')=>`<url><loc>${loc}</loc>${alternates}</url>`;
 const alternatesOf=(path:string)=>locales.map(l=>`<xhtml:link rel="alternate" hreflang="${l}" href="${base}${localized(path,l)}"/>`).join('')+`<xhtml:link rel="alternate" hreflang="x-default" href="${base}${path}"/>`;
 // The app and gallery switch language in the browser, so they have one address; the content pages have one per language.
 const translated=['/types',...typeCodes.map(code=>'/types/'+code.toLowerCase()),'/levels','/method'];
 const body=['<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  url(base+'/'),url(base+'/art-gallery'),
  ...translated.flatMap(path=>locales.map(locale=>url(base+localized(path,locale),alternatesOf(path)))),
  '</urlset>'].join('');
 return new Response(body,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=3600'}});
}
