import { env } from "cloudflare:workers";
import { guardCreate } from "../../../lib/abuse-guard.ts";
import { handleSession } from "../../../lib/session-service.ts";
export async function POST(request: Request) {
  return (await guardCreate(env, request)) ?? handleSession(env.DB, request);
}
