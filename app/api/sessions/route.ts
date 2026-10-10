import {getChatGPTUser} from "../../chatgpt-auth.ts";
import { env } from "cloudflare:workers";
import { handleSession, json } from "../../../lib/session-service.ts";
export async function POST(request: Request) {
  return env.DB ? handleSession(env.DB, request,undefined,"session",Date.now(),await getChatGPTUser()) : json({ error: "本機資料庫尚未準備完成。" }, 503);
}
