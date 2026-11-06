"use client";

import { useRouter } from "next/navigation";
import { useRealtimeEvent } from "@/components/realtime";
import { Avatar, TRACK_META } from "@/components/ui";

type Item = { id: string; kind: string; payload: Record<string, string | number | boolean>; createdAt: string; displayName: string | null; avatarHue: number | null };

function describe(i: Item) {
  const p = i.payload;
  switch (i.kind) {
    case "mission_completed":
      return (
        <>
          completed <strong className="font-medium text-text">{String(p.mission)}</strong>
          {p.track && <span className={`ml-1 text-xs ${TRACK_META[String(p.track)]?.text ?? ""}`}>{TRACK_META[String(p.track)]?.label}</span>}
        </>
      );
    case "achievement":
      return (
        <>
          earned <strong className="font-medium text-text">{String(p.achievement)}</strong>
        </>
      );
    case "joined":
      return "joined the team";
    case "team_created":
      return <>created the team</>;
    default:
      return i.kind.replace(/_/g, " ");
  }
}

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Public team activity: completions, badges, joins. Never answers or mistakes. */
export function ActivityFeed({ initial }: { initial: Item[] }) {
  const items = initial;
  const router = useRouter();
  // Live: refresh server data when teammates make progress.
  useRealtimeEvent("activity", () => router.refresh());
  if (!items.length) return <p className="mt-3 text-sm text-muted">No activity yet. Completed missions and earned badges show up here.</p>;
  return (
    <ul className="mt-3 space-y-2.5" aria-live="polite">
      {items.map((i) => (
        <li key={i.id} className="flex items-start gap-2.5 text-sm">
          <Avatar name={i.displayName ?? "?"} hue={i.avatarHue ?? 200} size={26} />
          <p className="min-w-0 flex-1 text-muted">
            <span className="font-medium text-text">{i.displayName ?? "Someone"}</span> {describe(i)}
          </p>
          <time className="shrink-0 text-xs text-faint" dateTime={i.createdAt}>
            {ago(i.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
