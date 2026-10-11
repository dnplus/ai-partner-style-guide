import { env } from "cloudflare:workers";
import { handleSession } from "../../../../lib/session-service.ts";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleSession(env.DB, request, id, "collect");
}
