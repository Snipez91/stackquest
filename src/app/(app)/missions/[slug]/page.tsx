import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { getMission } from "@/content";
import { toPublicMission } from "@/lib/public-mission";
import { requireContext } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { completedSlugs, markRaceAttempt, missingPrereqs, placedOutSlugs, startAttempt } from "@/server/learning";
import { Workspace } from "@/components/workspace/workspace";
import { Card, TrackPill } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const m = getMission((await params).slug);
  return { title: m?.title ?? "Mission" };
}

export default async function MissionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ race?: string }> }) {
  const { slug } = await params;
  const { race } = await searchParams;
  const ctx = await requireContext();
  const mission = getMission(slug);
  if (!mission) notFound();
  const db = await getDb();
  const done = await completedSlugs(db, ctx.user.id, ctx.team.id);
  const placed = await placedOutSlugs(db, ctx.user.id);
  const missing = missingPrereqs(mission, new Set([...done, ...placed]));
  if (missing.length) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-muted">
            <Lock size={18} aria-hidden /> Locked mission
          </div>
          <h1 className="mt-2 text-xl font-semibold">{mission.title}</h1>
          <div className="mt-1"><TrackPill track={mission.track} /></div>
          <p className="mt-3 text-sm text-muted">This mission builds on skills from earlier missions. Finish these first:</p>
          <ul className="mt-2 space-y-1.5">
            {missing.map((s) => {
              const p = getMission(s);
              return (
                <li key={s}>
                  <Link className="text-primary underline underline-offset-2" href={`/missions/${s}`}>{p?.title ?? s}</Link>
                </li>
              );
            })}
          </ul>
          <Link href={`/paths/${mission.track}`} className="btn-secondary mt-5">Back to the path</Link>
        </Card>
      </div>
    );
  }
  const attempt = await startAttempt(db, ctx.user.id, ctx.team.id, slug);
  const raceId = race && /^[0-9a-f-]{36}$/.test(race) && (await markRaceAttempt(db, ctx.user.id, ctx.team.id, attempt.id, race, slug)) ? race : undefined;
  return (
    <Workspace
      key={attempt.id}
      mission={toPublicMission(mission)}
      theme={ctx.user.theme === "light" ? "light" : "dark"}
      previouslyCompleted={done.has(slug)}
      raceId={raceId}
      attempt={{
        id: attempt.id,
        hintsUsed: attempt.hintsUsed,
        practicalPassed: attempt.practicalPassed,
        questionResults: attempt.questionResults ?? {},
        failedChecks: attempt.failedChecks,
        draft: attempt.draft ?? null,
        lastCheckResults: attempt.lastCheckResults ?? [],
      }}
    />
  );
}
