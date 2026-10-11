import { env } from "cloudflare:workers";
import { handleSession } from "../../../../lib/session-service.ts";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return handleSession(env.DB, request, id);
}
export const DELETE = GET;
export const PUT = GET;
