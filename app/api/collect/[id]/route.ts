import { env } from "cloudflare:workers";
import { handleSession, json } from "../../../../lib/session-service.ts";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return env.DB ? handleSession(env.DB, request, id, "collect") : json({ error: "資料庫無法使用。" }, 503);
}
