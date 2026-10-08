import { ForbiddenError, getSessionUser, heartbeat, leaveTicket, NotFoundError } from "@petey/core";

export const dynamic = "force-dynamic";

/**
 * Presence heartbeat for collision detection. The ticket page posts every few seconds with
 * { typing }, or { leave: true } when it closes, and gets back who else is there.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser(request.headers);
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { typing?: unknown; leave?: unknown };
  try {
    if (body.leave === true) {
      await leaveTicket(user, id);
      return new Response(null, { status: 204 });
    }
    return Response.json(await heartbeat(user, id, body.typing), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError)
      return new Response(null, { status: 404 });
    throw err;
  }
}
