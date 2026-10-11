import {getChatGPTUser} from "../../../chatgpt-auth.ts";
import { env } from "cloudflare:workers";
import { handleSession, json } from "../../../../lib/session-service.ts";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return env.DB ? handleSession(env.DB, request, id,"session",Date.now(),await getChatGPTUser()) : json({ error: "資料庫無法使用。" }, 503);
}
export const DELETE = GET;
export const PUT = GET;
