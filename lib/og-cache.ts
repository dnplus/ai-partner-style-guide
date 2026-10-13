// Drawing a preview runs satori and resvg, so each finished image is kept in the edge cache under a key
// that changes whenever its content does. Callers check that the card still exists before calling this,
// so a revoked card is never served from the cache. Where the Cache API is unavailable, this just renders.
export async function cachedImage(request: Request, key: string, render: () => Promise<Response>) {
  const cache = (globalThis as {caches?: {default?: Cache}}).caches?.default;
  const cacheKey = new Request(new URL('/__og-cache/' + encodeURIComponent(key), request.url).href);
  try { const hit = await cache?.match(cacheKey); if (hit) return hit; } catch { /* render instead */ }
  const response = await render();
  if (cache && response.ok) try { await cache.put(cacheKey, response.clone()); } catch { /* serve uncached */ }
  return response;
}
export async function contentKey(value: unknown) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))));
  return Array.from(bytes.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}
