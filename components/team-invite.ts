"use client";
import {useEffect, useMemo, useSyncExternalStore} from "react";
import {z} from "zod";

// The team a member joined through ?team=<code>, kept for this tab only, with the share they can still withdraw.
const KEY = "agent-mbti-team-v1";
const inviteSchema = z.object({
  code: z.string().regex(/^[0-9a-f]{32}$/),
  name: z.string(),
  shared: z.object({sessionId: z.string(), entryId: z.string(), withdrawToken: z.string().regex(/^[0-9a-f]{64}$/), member: z.string()}).nullable(),
}).strict();
export type TeamInvite = z.infer<typeof inviteSchema>;

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const read = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
function write(value: TeamInvite | null) {
  try { if (value) sessionStorage.setItem(KEY, JSON.stringify(value)); else sessionStorage.removeItem(KEY); } catch { /* storage unavailable: the invite lasts until reload */ }
  listeners.forEach((listener) => listener());
}

export function useTeamInvite() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const invite = useMemo(() => { try { const parsed = inviteSchema.safeParse(JSON.parse(raw ?? "null")); return parsed.success ? parsed.data : null; } catch { return null; } }, [raw]);
  useEffect(() => {
    const url = new URL(location.href);
    const code = url.searchParams.get("team");
    if (!code) return;
    url.searchParams.delete("team");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    if (!/^[0-9a-f]{32}$/.test(code)) return;
    void fetch(`/api/teams/join/${code}`, {cache: "no-store", redirect: "error"}).then(async (response) => {
      const data = response.ok ? await response.json() as {name?: string} : null;
      if (data?.name) write({code, name: data.name, shared: null});
    }).catch(() => {});
  }, []);
  async function share(sessionId: string, readToken: string, member: string) {
    if (!invite) return "";
    const response = await fetch(`/api/teams/join/${invite.code}/entries`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({sessionId, readToken, member}), redirect: "error"});
    const data = await response.json().catch(() => ({})) as {entryId?: string; withdrawToken?: string; error?: string};
    if (!response.ok || !data.entryId || !data.withdrawToken) return data.error ?? "暫時無法處理，請稍後再試。";
    write({...invite, shared: {sessionId, entryId: data.entryId, withdrawToken: data.withdrawToken, member}});
    return "";
  }
  async function withdraw() {
    if (!invite?.shared) return "";
    const response = await fetch(`/api/teams/join/${invite.code}/entries/${invite.shared.entryId}`, {method: "DELETE", headers: {Authorization: `Bearer ${invite.shared.withdrawToken}`}, redirect: "error"});
    if (!response.ok && response.status !== 404) return "暫時無法處理，請稍後再試。";
    write({...invite, shared: null});
    return "";
  }
  return {invite, share, withdraw, leave: () => write(null)};
}
