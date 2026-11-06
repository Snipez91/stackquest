"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, uid } from "@/lib/client-api";
import { useRealtime, useRealtimeEvent } from "@/components/realtime";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { FormattedMessage } from "./format";

export type Channel = { id: string; kind: "general" | "track" | "mission"; key: string; name: string; unread: number; mentions: number };
type Msg = {
  id: string;
  channelId: string;
  userId: string;
  displayName: string;
  handle: string;
  avatarHue: number;
  body: string;
  clientId: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  /** Client-only delivery state for optimistic messages. */
  pending?: "sending" | "failed";
  error?: string;
};

export type Me = { id: string; handle: string; role: "admin" | "member"; displayName: string; avatarHue: number };

const MAX = 4000;

function timeLabel(iso: string) {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ChatPanel({ me, initialChannelId, missionSlug, compact = false }: { me: Me; initialChannelId?: string; missionSlug?: string; compact?: boolean }) {
  const { status, refreshCounts, online } = useRealtime();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [channelId, setChannelId] = useState<string | undefined>(initialChannelId);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    try {
      const r = await api<{ channels: Channel[] }>("/api/chat/channels");
      let chans = r.channels;
      let target = initialChannelId;
      if (missionSlug) {
        const c = await api<{ channel: { id: string } }>("/api/chat/channels", { body: { missionSlug } });
        target = c.channel.id;
        if (!chans.some((x) => x.id === c.channel.id)) chans = (await api<{ channels: Channel[] }>("/api/chat/channels")).channels;
      }
      setChannels(chans);
      setChannelId((cur) => cur ?? target ?? chans.find((c) => c.kind === "general")?.id ?? chans[0]?.id);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Couldn't load channels.");
    }
  }, [initialChannelId, missionSlug]);

  useEffect(() => {
    // Data fetch on mount; state is set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadChannels();
  }, [loadChannels]);

  useRealtimeEvent("message.created", (d) => {
    const m = d.message as Msg | undefined;
    if (!m || m.userId === me.id || m.channelId === channelId) return;
    setChannels((cs) => cs?.map((c) => (c.id === m.channelId ? { ...c, unread: c.unread + 1, mentions: c.mentions + (m.body.toLowerCase().includes("@" + me.handle) ? 1 : 0) } : c)) ?? cs);
  });

  const active = channels?.find((c) => c.id === channelId);
  const groups = useMemo(() => {
    const cs = channels ?? [];
    return [
      { label: "Team", items: cs.filter((c) => c.kind === "general") },
      { label: "Tracks", items: cs.filter((c) => c.kind === "track") },
      { label: "Mission threads", items: cs.filter((c) => c.kind === "mission") },
    ].filter((g) => g.items.length);
  }, [channels]);

  if (loadError) {
    return (
      <div className="p-4 text-sm" role="alert">
        <p>{loadError}</p>
        <button className="btn-secondary mt-3" onClick={() => void loadChannels()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0", compact ? "flex-col" : "flex-col md:flex-row")}>
      <nav aria-label="Channels" className={cn("shrink-0 border-border", compact ? "border-b" : "border-b md:w-60 md:border-r md:border-b-0")}>
        {compact ? (
          <div className="p-2">
            <label htmlFor="chan-select" className="sr-only">Channel</label>
            <select id="chan-select" className="input py-1.5" value={channelId ?? ""} onChange={(e) => setChannelId(e.target.value)}>
              {(channels ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kind === "mission" ? "🧵 " : "# "}
                  {c.name}
                  {c.unread ? ` (${c.unread} new)` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex gap-1 overflow-x-auto p-2 md:max-h-full md:flex-col md:overflow-y-auto">
            {!channels && <p className="p-2 text-sm text-muted">Loading channels…</p>}
            {groups.map((g) => (
              <div key={g.label} className="flex gap-1 md:mb-3 md:flex-col">
                <p className="hidden px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-faint md:block">{g.label}</p>
                {g.items.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChannelId(c.id)}
                    aria-current={c.id === channelId ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      c.id === channelId ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text",
                      c.unread > 0 && c.id !== channelId && "font-semibold text-text",
                    )}
                  >
                    <span className="truncate">
                      <span aria-hidden className="mr-1 text-faint">{c.kind === "mission" ? "↳" : "#"}</span>
                      {c.name}
                    </span>
                    {c.id !== channelId && c.unread > 0 && (
                      <span className={cn("rounded-full px-1.5 text-[11px] font-semibold", c.mentions ? "bg-warning text-[#0a0d13]" : "bg-primary text-primary-ink")}>
                        {c.mentions ? `@${c.mentions}` : c.unread}
                        <span className="sr-only"> unread{c.mentions ? " mentions" : ""}</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </nav>
      {channelId && active ? (
        <MessagePane
          key={channelId}
          me={me}
          channel={active}
          online={online}
          rtStatus={status}
          onRead={() => {
            setChannels((cs) => cs?.map((c) => (c.id === channelId ? { ...c, unread: 0, mentions: 0 } : c)) ?? cs);
            refreshCounts();
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted">{channels ? "Pick a channel." : "Loading…"}</div>
      )}
    </div>
  );
}

function MessagePane({ me, channel, onRead, rtStatus, online }: { me: Me; channel: Channel; onRead: () => void; rtStatus: string; online: Set<string> }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  });

  const markRead = useCallback(() => {
    void api("/api/chat/read", { body: { channelId: channel.id } })
      .then(() => onReadRef.current())
      .catch(() => {});
  }, [channel.id]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Msg[]; hasMore: boolean }>(`/api/chat/messages?channel=${channel.id}`);
      setMsgs((prev) => {
        const unsent = (prev ?? []).filter((m) => m.pending);
        return [...r.messages, ...unsent.filter((u) => !r.messages.some((m) => m.clientId === u.clientId))];
      });
      setHasMore(r.hasMore);
      setError(null);
      markRead();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load messages.");
    }
  }, [channel.id, markRead]);

  useEffect(() => {
    // Data fetch on mount; state is set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // After a reconnect, refetch to fill any gap while we were disconnected.
  const prevStatus = useRef(rtStatus);
  useEffect(() => {
    if (prevStatus.current !== "open" && rtStatus === "open" && msgs) void load();
    prevStatus.current = rtStatus;
  }, [rtStatus, load, msgs]);

  const upsert = useCallback((m: Msg) => {
    setMsgs((prev) => {
      if (!prev) return prev;
      const i = prev.findIndex((x) => x.id === m.id || (x.clientId === m.clientId && x.userId === m.userId));
      if (i === -1) return [...prev, m];
      const next = [...prev];
      next[i] = m;
      return next;
    });
  }, []);

  useRealtimeEvent("message.created", (d) => {
    const m = d.message as Msg | undefined;
    if (m?.channelId !== channel.id) return;
    upsert(m);
    if (document.visibilityState === "visible") markRead();
  });
  useRealtimeEvent("message.updated", (d) => {
    const m = d.message as Msg | undefined;
    if (m?.channelId === channel.id) upsert(m);
  });
  useRealtimeEvent("message.deleted", (d) => {
    if (d.channelId !== channel.id) return;
    setMsgs((prev) => prev?.map((m) => (m.id === d.id ? { ...m, deleted: true, body: "" } : m)) ?? prev);
  });

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const loadOlder = async () => {
    if (!msgs?.length) return;
    const el = listRef.current;
    const before = el?.scrollHeight ?? 0;
    const r = await api<{ messages: Msg[]; hasMore: boolean }>(`/api/chat/messages?channel=${channel.id}&before=${encodeURIComponent(msgs[0].createdAt)}`);
    stick.current = false;
    setMsgs((prev) => [...r.messages, ...(prev ?? [])]);
    setHasMore(r.hasMore);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  };

  const send = async (body: string, clientId = uid()) => {
    stick.current = true;
    const optimistic: Msg = {
      id: `local-${clientId}`,
      channelId: channel.id,
      userId: me.id,
      displayName: me.displayName,
      handle: me.handle,
      avatarHue: me.avatarHue,
      body,
      clientId,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deleted: false,
      pending: "sending",
    };
    upsert(optimistic);
    try {
      // Same clientId on retry → the server returns the original instead of duplicating.
      const r = await api<{ message: Msg }>("/api/chat/messages", { body: { channelId: channel.id, body, clientId } });
      setMsgs((prev) => {
        const rest = (prev ?? []).filter((m) => m.clientId !== clientId || m.userId !== me.id);
        return [...rest, r.message].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    } catch (e) {
      upsert({ ...optimistic, pending: "failed", error: e instanceof ApiError ? e.message : "Not sent." });
    }
  };

  const remove = async (m: Msg) => {
    if (!confirm(m.userId === me.id ? "Delete this message?" : `Delete ${m.displayName}'s message as admin?`)) return;
    try {
      await api(`/api/chat/messages/${m.id}`, { method: "DELETE" });
      setMsgs((prev) => prev?.map((x) => (x.id === m.id ? { ...x, deleted: true, body: "" } : x)) ?? prev);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Couldn't delete.");
    }
  };

  const saveEdit = async (m: Msg, body: string) => {
    try {
      const r = await api<{ message: Msg }>(`/api/chat/messages/${m.id}`, { method: "PATCH", body: { body } });
      upsert(r.message);
      setEditing(null);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Couldn't save the edit.");
    }
  };

  return (
    <section aria-label={`Messages in ${channel.name}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="truncate font-semibold">
          <span aria-hidden className="mr-1 text-faint">{channel.kind === "mission" ? "↳" : "#"}</span>
          {channel.name}
        </h2>
        <span className="text-xs text-faint">{channel.kind === "mission" ? "Mission discussion — use ||spoilers|| for answers" : channel.kind === "track" ? "Track channel" : "Whole team"}</span>
      </header>
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {error && (
          <div role="alert" className="mb-3 rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm">
            {error}{" "}
            <button className="underline" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        {!msgs && !error && <p className="text-sm text-muted">Loading messages…</p>}
        {hasMore && (
          <button className="btn-ghost mx-auto mb-2 block text-xs" onClick={() => void loadOlder()}>
            Load older messages
          </button>
        )}
        {msgs && msgs.length === 0 && (
          <div className="py-10 text-center text-sm text-muted">
            <p className="font-medium text-text">No messages yet.</p>
            <p className="mt-1">{channel.kind === "mission" ? "Ask a question or share an approach. Wrap answers in ||spoilers||." : "Say hello to your team."}</p>
          </div>
        )}
        <ul className="space-y-3">
          {msgs?.map((m, i) => {
            const prev = msgs[i - 1];
            const grouped = prev && prev.userId === m.userId && !prev.deleted && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
            const mine = m.userId === me.id;
            return (
              <li key={m.clientId + m.userId} className={cn("group relative flex gap-2.5", grouped && "-mt-2")}>
                <div className="w-8 shrink-0">{!grouped && <Avatar name={m.displayName} hue={m.avatarHue} size={32} online={online.has(m.userId)} />}</div>
                <div className="min-w-0 flex-1">
                  {!grouped && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{m.displayName}</span>
                      <time className="text-[11px] text-faint" dateTime={m.createdAt}>
                        {timeLabel(m.createdAt)}
                      </time>
                    </div>
                  )}
                  {m.deleted ? (
                    <p className="text-sm italic text-faint">Message deleted</p>
                  ) : editing === m.id ? (
                    <EditBox initial={m.body} onCancel={() => setEditing(null)} onSave={(b) => void saveEdit(m, b)} />
                  ) : (
                    <FormattedMessage body={m.body} myHandle={me.handle} />
                  )}
                  {m.editedAt && !m.deleted && <span className="text-[11px] text-faint">(edited)</span>}
                  {m.pending === "sending" && <span className="text-[11px] text-faint">Sending…</span>}
                  {m.pending === "failed" && (
                    <div role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-xs text-danger">
                      <span>Not sent: {m.error}</span>
                      <button className="underline" onClick={() => void send(m.body, m.clientId)}>
                        Retry
                      </button>
                      <button className="text-muted underline" onClick={() => setMsgs((p) => p?.filter((x) => x.clientId !== m.clientId) ?? p)}>
                        Discard
                      </button>
                    </div>
                  )}
                </div>
                {!m.deleted && !m.pending && (mine || me.role === "admin") && editing !== m.id && (
                  <div className="absolute top-0 right-0 hidden gap-1 rounded-md border border-border bg-surface p-0.5 group-focus-within:flex group-hover:flex">
                    {mine && (
                      <button className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-text" onClick={() => setEditing(m.id)} aria-label="Edit message">
                        Edit
                      </button>
                    )}
                    <button className="rounded px-1.5 py-0.5 text-xs text-danger hover:bg-danger/10" onClick={() => void remove(m)} aria-label="Delete message">
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <Composer onSend={send} disabled={!msgs} channelName={channel.name} />
    </section>
  );
}

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (b: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <div className="mt-1">
      <label className="sr-only" htmlFor="edit-msg">Edit message</label>
      <textarea id="edit-msg" className="input min-h-[60px] font-mono text-xs" value={v} maxLength={MAX} onChange={(e) => setV(e.target.value)} autoFocus />
      <div className="mt-1 flex gap-2">
        <button className="btn-primary px-2 py-1 text-xs" onClick={() => onSave(v)} disabled={!v.trim()}>
          Save
        </button>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Composer({ onSend, disabled, channelName }: { onSend: (b: string) => void; disabled: boolean; channelName: string }) {
  const [v, setV] = useState("");
  const [help, setHelp] = useState(false);
  const submit = () => {
    const b = v.trim();
    if (!b || b.length > MAX) return;
    onSend(b);
    setV("");
  };
  return (
    <div className="border-t border-border p-3">
      <label htmlFor="composer" className="sr-only">
        Message #{channelName}
      </label>
      <textarea
        id="composer"
        className="input max-h-48 min-h-[44px] resize-y"
        placeholder={`Message #${channelName}`}
        value={v}
        maxLength={MAX}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        aria-describedby="composer-help"
        disabled={disabled}
      />
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-faint">
        <span id="composer-help">
          Enter to send · Shift+Enter for a new line ·{" "}
          <button type="button" className="underline" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
            formatting
          </button>
        </span>
        <span className={cn(v.length > MAX - 200 && "text-warning")}>
          {v.length}/{MAX}
        </span>
        <button className="btn-primary px-3 py-1 text-xs" onClick={submit} disabled={disabled || !v.trim()}>
          Send
        </button>
      </div>
      {help && (
        <p className="mt-1.5 rounded-md bg-surface-2 p-2 font-mono text-[11px] text-muted">
          ```python …``` code block · `inline` · **bold** · _italic_ · ||spoiler|| · @handle mentions
        </p>
      )}
    </div>
  );
}
