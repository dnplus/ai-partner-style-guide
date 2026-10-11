import { env } from "cloudflare:workers";
import { handleSession } from "../../../lib/session-service.ts";
export async function POST(request: Request) {
  return handleSession(env.DB, request);
}
