import Link from "next/link";
import { missionsForTrack, tracks, skillsForTrack } from "@/content";
import { requireContext } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { masteryMap, missionStatuses, trackSkillAverage } from "@/server/views";
import { Card, MasteryMeter, PageHeader, Progress, TrackPill, TRACK_META } from "@/components/ui";
import type { TrackId } from "@/content/schema";

export const metadata = { title: "Learning paths" };

export default async function PathsPage() {
  const { user, team } = await requireContext();
  const db = await getDb();
  const [{ status }, mmap] = await Promise.all([missionStatuses(db, user.id, team.id), masteryMap(db, user.id, team.id)]);
  return (
    <div>
      <PageHeader
        title="Learning paths"
        description="Four connected tracks, each from beginner fundamentals to realistic troubleshooting, plus cross-track capstones. This is a launch curriculum — a solid foundation, not complete professional mastery."
      />
      <ul className="grid gap-4 md:grid-cols-2">
        {tracks.map((t) => {
          const ms = missionsForTrack(t.id);
          const done = ms.filter((m) => status.get(m.slug) === "completed").length;
          const tiers = (["beginner", "intermediate", "advanced"] as const).map((tier) => ms.filter((m) => m.tier === tier).length);
          return (
            <li key={t.id}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <TrackPill track={t.id} />
                    <h2 className="mt-2 text-lg font-semibold">{t.name}</h2>
                    <p className="text-sm text-muted">{t.tagline}</p>
                  </div>
                  <span className="text-sm text-muted tabular-nums">
                    {done}/{ms.length}
                  </span>
                </div>
                <Progress value={done} max={ms.length || 1} label={`${t.name} progress`} className="mt-3" color={TRACK_META[t.id].color} />
                {t.id !== "capstone" && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-faint">Average mastery estimate across {skillsForTrack(t.id).length} skills</p>
                    <MasteryMeter score={trackSkillAverage(mmap, t.id as TrackId)} />
                  </div>
                )}
                <p className="mt-3 text-xs text-faint">
                  {t.id === "capstone" ? `${ms.length} cross-track incidents` : `${tiers[0]} beginner · ${tiers[1]} intermediate · ${tiers[2]} advanced`}
                </p>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted hover:text-text">What this track covers (and doesn&apos;t yet)</summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-text">Launch curriculum</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                        {t.coverage.included.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text">Future coverage</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
                        {t.coverage.future.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
                <Link href={`/paths/${t.id}`} className="btn-secondary mt-4 self-start">
                  Open {t.name} map
                </Link>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
