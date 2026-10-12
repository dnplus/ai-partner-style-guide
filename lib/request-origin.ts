import {headers} from 'next/headers';
// Absolute URLs for metadata: canonical links, hreflang and preview images need the host the visitor used.
export async function requestOrigin(){
 const list=await headers(),host=list.get('host')??'localhost';
 return (list.get('x-forwarded-proto')??(/^(127\.0\.0\.1|localhost)/.test(host)?'http':'https'))+'://'+host;
}
