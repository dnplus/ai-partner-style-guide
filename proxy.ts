import {NextResponse, type NextRequest} from 'next/server';
import {siteRedirect} from './lib/site-host.ts';

export function proxy(request: NextRequest) {
  const target = siteRedirect(request.url);
  return target ? NextResponse.redirect(target, 301) : NextResponse.next();
}
