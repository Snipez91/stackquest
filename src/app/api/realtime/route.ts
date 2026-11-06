import { apiContext } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { touchPresence } from "@/server/chat";
import { publish, subscribe, type RealtimeEvent } from "@/server/realtime";
import { requireMembership } from "@/server/teams";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream for the caller's active team. Membership is
 * checked on connect, on every heartbeat, and whenever team membership
 * changes; a removed member's stream closes immediately.
 */
export async function GET(req: Request) {
  const ctx = await apiContext();
  if (!ctx) return new Response("Sign in to continue.", { status: 401 });
  const db = await getDb();
  const teamId = ctx.team.id;
  const userId = ctx.user.id;
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };
      const stillMember = async () => {
        try {
          await requireMembership(db, userId, teamId);
          return true;
        } catch {
          send("revoked", { reason: "You are no longer a member of this team." });
          close();
          return false;
        }
      };
      const unsubscribe = subscribe(teamId, (e: RealtimeEvent) => {
        if (e.teamId !== teamId) return; // defence in depth
        if (e.type === "team.changed") {
          void stillMember().then((ok) => ok && send(e.type, e.data));
          return;
        }
        send(e.type, e.data);
      });
      const beat = setInterval(async () => {
        if (!(await stillMember())) return;
        await touchPresence(db, userId, teamId).catch(() => {});
        if (!closed) controller.enqueue(enc.encode(`: ping\n\n`));
      }, HEARTBEAT_MS);
      function close() {
        if (closed) return;
        closed = true;
        clearInterval(beat);
        unsubscribe();
        publish({ teamId, type: "presence", data: { userId, online: false } });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
      cleanup = close;
      req.signal.addEventListener("abort", close);
      send("ready", { teamId, retry: 3000 });
      void touchPresence(db, userId, teamId).then(() => publish({ teamId, type: "presence", data: { userId, online: true } }));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
