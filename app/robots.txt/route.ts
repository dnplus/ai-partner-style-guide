export function GET(request:Request){
 const base=new URL(request.url).origin;
 // Search and answer engines may read and cite the public pages; personal cards stay reachable for link previews but carry noindex.
 return new Response(`User-agent: *\nContent-Signal: search=yes, ai-input=yes\nAllow: /\nDisallow: /api/\nDisallow: /team\n\nSitemap: ${base}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'}});
}
