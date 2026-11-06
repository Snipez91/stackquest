"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type RtStatus = "connecting" | "open" | "reconnecting" | "offline" | "revoked";
type Handler = (data: Record<string, unknown>) => void;

type Ctx = {
  status: RtStatus;
  on: (event: string, h: Handler) => () => void;
  reconnect: () => void;
  online: Set<string>;
  unread: number;
  mentions: number;
  refreshCounts: () => void;
};

const RealtimeContext = createContext<Ctx | null>(null);

const EVENTS = ["message.created", "message.updated", "message.deleted", "activity", "presence", "team.changed", "leaderboard", "revoked", "ready"];

/**
 * One EventSource per tab for the active team. EventSource reconnects on its
 * own; we surface the state so the UI can show "Reconnecting…" honestly, and
 * offer a manual retry after repeated failures.
 */
export function RealtimeProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [status, setStatus] = useState<RtStatus>("connecting");
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState({ unread: 0, mentions: 0 });
  const handlers = useRef(new Map<string, Set<Handler>>());
  const esRef = useRef<EventSource | null>(null);
  const failures = useRef(0);
  const [nonce, setNonce] = useState(0);

  const refreshCounts = useCallback(() => {
    fetch("/api/presence", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { online: string[]; unread: number; mentions: number } | null) => {
        if (!d) return;
        setOnline(new Set(d.online));
        setCounts({ unread: d.unread, mentions: d.mentions });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/realtime");
    esRef.current = es;
    setStatus(failures.current ? "reconnecting" : "connecting");
    const dispatch = (type: string) => (ev: MessageEvent) => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(ev.data);
      } catch {
        /* ignore */
      }
      if (type === "ready") {
        failures.current = 0;
        setStatus("open");
        refreshCounts();
      }
      if (type === "revoked") {
        setStatus("revoked");
        es.close();
      }
      if (type === "presence") {
        setOnline((prev) => {
          const n = new Set(prev);
          if (data.online) n.add(String(data.userId));
          else n.delete(String(data.userId));
          return n;
        });
      }
      if (type === "message.created") {
        const m = data.message as { userId?: string } | undefined;
        if (m?.userId !== userId) refreshCounts();
      }
      for (const h of handlers.current.get(type) ?? []) h(data);
    };
    for (const e of EVENTS) es.addEventListener(e, dispatch(e) as EventListener);
    es.onerror = () => {
      failures.current++;
      if (es.readyState === EventSource.CLOSED) {
        setStatus("offline");
      } else {
        setStatus("reconnecting");
      }
      if (failures.current >= 6) {
        es.close();
        setStatus("offline");
      }
    };
    const poll = setInterval(refreshCounts, 60_000);
    return () => {
      clearInterval(poll);
      es.close();
    };
  }, [nonce, refreshCounts, userId]);

  useEffect(() => {
    const onOnline = () => setNonce((n) => n + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const on = useCallback((event: string, h: Handler) => {
    let set = handlers.current.get(event);
    if (!set) handlers.current.set(event, (set = new Set()));
    set.add(h);
    return () => set!.delete(h);
  }, []);

  const reconnect = useCallback(() => {
    failures.current = 0;
    setNonce((n) => n + 1);
  }, []);

  return (
    <RealtimeContext.Provider value={{ status, on, reconnect, online, unread: counts.unread, mentions: counts.mentions, refreshCounts }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const c = useContext(RealtimeContext);
  if (!c) throw new Error("useRealtime outside RealtimeProvider");
  return c;
}

export function useRealtimeEvent(event: string, h: Handler) {
  const { on } = useRealtime();
  const ref = useRef(h);
  useEffect(() => {
    ref.current = h;
  });
  useEffect(() => on(event, (d) => ref.current(d)), [event, on]);
}

export function ConnectionBanner() {
  const { status, reconnect } = useRealtime();
  if (status === "open" || status === "connecting") return null;
  const text =
    status === "revoked"
      ? "You've been removed from this team. Live updates stopped."
      : status === "offline"
        ? "Live updates are disconnected. Your work is safe; messages you send will retry."
        : "Reconnecting to live updates…";
  return (
    <div role="status" className="flex items-center justify-between gap-3 border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-xs">
      <span>
        <span aria-hidden className="mr-1.5">{status === "reconnecting" ? "◌" : "⚠"}</span>
        {text}
      </span>
      {status === "offline" && (
        <button className="btn-secondary px-2 py-1 text-xs" onClick={reconnect}>
          Retry now
        </button>
      )}
    </div>
  );
}
