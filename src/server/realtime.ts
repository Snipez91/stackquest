import { randomUUID } from "node:crypto";

/**
 * Team-scoped realtime fan-out.
 *
 * Every event carries the team id it belongs to; subscribers register for one
 * team only after the SSE route has verified membership, so events can never
 * cross teams. With node-postgres, events are also relayed through Postgres
 * LISTEN/NOTIFY so all app instances deliver them.
 */

export type RealtimeEvent = {
  teamId: string;
  type:
    | "message.created"
    | "message.updated"
    | "message.deleted"
    | "activity"
    | "presence"
    | "team.changed"
    | "leaderboard";
  data: Record<string, unknown>;
};

type Listener = (e: RealtimeEvent) => void;

type Bus = {
  instance: string;
  listeners: Map<string, Set<Listener>>;
  pgReady: Promise<((payload: string) => Promise<void>) | null> | null;
};

const g = globalThis as unknown as { __sqBus?: Bus };
const bus: Bus = (g.__sqBus ??= { instance: randomUUID(), listeners: new Map(), pgReady: null });

const CHANNEL = "stackquest_events";

function deliver(e: RealtimeEvent) {
  for (const l of bus.listeners.get(e.teamId) ?? []) {
    try {
      l(e);
    } catch {
      /* a broken subscriber must not affect others */
    }
  }
}

async function pgRelay(): Promise<((payload: string) => Promise<void>) | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const { Client } = await import("pg");
  const ssl = url.includes("localhost") || process.env.DATABASE_SSL === "false" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "true" };
  const listen = new Client({ connectionString: url, ssl });
  const notify = new Client({ connectionString: url, ssl });
  await Promise.all([listen.connect(), notify.connect()]);
  await listen.query(`LISTEN ${CHANNEL}`);
  listen.on("notification", (n) => {
    if (!n.payload) return;
    try {
      const { origin, event } = JSON.parse(n.payload) as { origin: string; event: RealtimeEvent };
      if (origin !== bus.instance) deliver(event);
    } catch {
      /* ignore malformed */
    }
  });
  const reset = () => {
    bus.pgReady = null;
  };
  listen.on("error", reset);
  notify.on("error", reset);
  return async (payload: string) => {
    await notify.query("select pg_notify($1, $2)", [CHANNEL, payload]);
  };
}

export function publish(e: RealtimeEvent) {
  deliver(e);
  if (!process.env.DATABASE_URL) return;
  bus.pgReady ??= pgRelay().catch((err) => {
    console.error("[realtime] LISTEN/NOTIFY unavailable:", err);
    bus.pgReady = null;
    return null;
  });
  let payload = JSON.stringify({ origin: bus.instance, event: e });
  // NOTIFY payloads are limited to 8000 bytes; large events tell clients to refetch.
  if (payload.length > 7500) payload = JSON.stringify({ origin: bus.instance, event: { ...e, data: { refetch: true } } });
  void bus.pgReady?.then((send) => send?.(payload)).catch(() => {});
}

export function subscribe(teamId: string, l: Listener): () => void {
  let set = bus.listeners.get(teamId);
  if (!set) bus.listeners.set(teamId, (set = new Set()));
  set.add(l);
  if (process.env.DATABASE_URL) bus.pgReady ??= pgRelay().catch(() => null);
  return () => {
    set!.delete(l);
    if (!set!.size) bus.listeners.delete(teamId);
  };
}

export function subscriberCount(teamId: string) {
  return bus.listeners.get(teamId)?.size ?? 0;
}
