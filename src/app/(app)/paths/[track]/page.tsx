import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CircleDot, Lock, Play } from "lucide-react";
import { getMission, getTrack, missionsForTrack, skillsForTrack } from "@/content";
import { TrackIdSchema } from "@/content/schema";
import { requireContext } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { masteryMap, missionStatuses, type MissionStatus } from "@/server/views";
import { Card, MasteryMeter, PageHeader, TierBadge, TrackPill, TRACK_META } from "@/components/ui";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }) {
  return { title: getTrack((await params).track)?.name ?? "Path" };
}

const STATUS: Record<MissionStatus, { label: string; icon: typeof Check; cls: string }> = {
  completed: { label: "Completed", icon: Check, cls: "text-success" },
  in_progress: { label: "In progress", icon: CircleDot, cls: "text-primary" },
  available: { label: "Available", icon: Play, cls: "text-text" },
  locked: { label: "Locked", icon: Lock, cls: "text-faint" },
};

export default async function TrackPage({ params }: { params: Promise<{ track: string }> }) {
  const { track: raw } = await params;
  const parsed = TrackIdSchema.safeParse(raw);
  if (!parsed.success) notFound();
  const track = getTrack(parsed.data)!;
  const { user, team } = await requireContext();
  const db = await getDb();
  const [{ status, placed }, mmap] = await Promise.all([missionStatuses(db, user.id, team.id), masteryMap(db, user.id, team.id)]);
  const ms = missionsForTrack(track.id);
  const meta = TRACK_META[track.id];

  return (
    <div>
      <PageHeader eyebrow={<TrackPill track={track.id} />} title={`${track.name} path`} description={track.description} actions={<Link href="/paths" className="btn-ghost">All paths</Link>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {(["beginner", "intermediate", "advanced"] as const).map((tier) => {
            const list = ms.filter((m) => m.tier === tier);
            if (!list.length) return null;
            return (
              <section key={tier} aria-labelledby={`tier-${tier}`}>
                <h2 id={`tier-${tier}`} className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">
                  <TierBadge tier={tier} />
                </h2>
                <ol className="relative space-y-3 border-l-2 pl-6" style={{ borderColor: `color-mix(in oklab, ${meta.color} 35%, transparent)` }}>
                  {list.map((m) => {
                    const st = status.get(m.slug) ?? "locked";
                    const S = STATUS[st];
                    const isPlaced = placed.has(m.slug) && st !== "completed";
                    return (
                      <li key={m.slug} className="relative">
                        <span aria-hidden className={cn("absolute top-4 -left-[33px] flex h-4 w-4 items-center justify-center rounded-full border-2 bg-bg", st === "completed" ? "border-success" : st === "locked" ? "border-border-strong" : "")} style={st !== "completed" && st !== "locked" ? { borderColor: meta.color } : undefined}>
                          {st === "completed" && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                        </span>
                        <Card as="div" className={cn("p-4 transition-colors", st === "locked" ? "opacity-75" : "hover:border-border-strong")}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-semibold">
                                {st === "locked" ? m.title : <Link href={`/missions/${m.slug}`} className="hover:underline">{m.title}</Link>}
                              </h3>
                              <p className="mt-0.5 text-sm text-muted">{m.summary}</p>
                            </div>
                            <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium", S.cls)}>
                              <S.icon size={14} aria-hidden /> {isPlaced ? "Optional (placed out)" : S.label}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                            <span>~{m.minutes} min</span>
                            <span>{m.assessmentTypes.map((a) => a.replace(/-/g, " ")).join(" · ")}</span>
                          </div>
                          {m.prerequisites.length > 0 && (
                            <p className="mt-1.5 text-xs text-muted">
                              Requires:{" "}
                              {m.prerequisites.map((p, i) => (
                                <span key={p}>
                                  {i > 0 && ", "}
                                  <span className={status.get(p) === "completed" ? "text-success" : ""}>
                                    {getMission(p)?.title ?? p}
                                    {status.get(p) === "completed" ? " ✓" : ""}
                                  </span>
                                </span>
                              ))}
                            </p>
                          )}
                          {st !== "locked" && (
                            <Link href={`/missions/${m.slug}`} className={cn("mt-3", st === "completed" ? "btn-ghost -ml-2 px-2 py-1 text-xs" : "btn-secondary px-3 py-1.5 text-xs")}>
                              {st === "completed" ? "Practise again" : st === "in_progress" ? "Continue" : "Start"}
                            </Link>
                          )}
                        </Card>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
        {track.id !== "capstone" && (
          <aside>
            <Card className="sticky top-6 p-5">
              <h2 className="font-semibold">Skills in this track</h2>
              <p className="mt-1 text-xs text-faint">Mastery is a learning estimate. Independent solves and reviews after a delay count most. <Link className="underline" href="/scoring">How it works</Link></p>
              <ul className="mt-4 space-y-3">
                {skillsForTrack(track.id).map((s) => (
                  <li key={s.id}>
                    <p className="text-sm">{s.name}</p>
                    <MasteryMeter score={mmap.get(s.id)?.score ?? 0} compact />
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}
