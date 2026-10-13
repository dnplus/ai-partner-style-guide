"use client";
import {useEffect, useMemo, useSyncExternalStore} from "react";
import {z} from "zod";
import {assessmentSchema} from "../lib/contract.ts";
import {families} from "../lib/catalog.ts";
import {funnelSource, VIA_KEY, type FunnelSource} from "../lib/funnel.ts";
import type {CompareTarget} from "../lib/public-card-service.ts";

// The card a visitor came to compare against through ?vs=<id>, kept for this tab only.
const KEY = "ai-partner-compare-v1";
const targetSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  nickname: z.string(),
  family: z.enum(families.map((f) => f.id) as [string, ...string[]]),
  style: z.enum(["regular", "chibi"]),
  assessment: assessmentSchema.nullable(),
});

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const read = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
function write(value: CompareTarget | null) {
  try { if (value) sessionStorage.setItem(KEY, JSON.stringify(value)); else sessionStorage.removeItem(KEY); } catch { /* storage unavailable: the comparison lasts until reload */ }
  listeners.forEach((listener) => listener());
}
export function storedVia(): FunnelSource | null { try { return funnelSource(sessionStorage.getItem(VIA_KEY)); } catch { return null; } }

export function useCompare() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const target = useMemo(() => { try { const parsed = targetSchema.safeParse(JSON.parse(raw ?? "null")); return parsed.success ? parsed.data as CompareTarget : null; } catch { return null; } }, [raw]);
  useEffect(() => {
    const url = new URL(location.href);
    const id = url.searchParams.get("vs"), via = funnelSource(url.searchParams.get("via"));
    if (!id && !via) return;
    url.searchParams.delete("vs"); url.searchParams.delete("via");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    if (via) try { sessionStorage.setItem(VIA_KEY, via); } catch { /* the visit just goes uncounted */ }
    if (!id || !/^[A-Za-z0-9_-]{22}$/.test(id)) return;
    void fetch(`/api/cards/${id}`, {cache: "no-store", redirect: "error"}).then(async (response) => {
      const parsed = targetSchema.safeParse(response.ok ? await response.json() : null);
      if (parsed.success && parsed.data.assessment) write(parsed.data as CompareTarget);
    }).catch(() => {});
  }, []);
  return {target, leave: () => write(null)};
}
