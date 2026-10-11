import { env } from "cloudflare:workers";
import { guardWrite } from "../../../../lib/abuse-guard.ts";
import { handleSession } from "../../../../lib/session-service.ts";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return (await guardWrite(env, request)) ?? handleSession(env.DB, request, id, "collect");
}
