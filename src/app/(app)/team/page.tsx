import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { Flag, Medal, Timer, Trash2 } from "lucide-react";
import { missions, tracks } from "@/content";
import { TrackIdSchema } from "@/content/schema";
import { achievementById } from "@/lib/achievements";
import { requireContext } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { races } from "@/server/db/schema";
import { goalsWithProgress, leaderboard, raceBoard, recentActivity, recognition, teamProgress } from "@/server/leaderboard";
import { Avatar, Card, EmptyState, PageHeader, Progress, TrackPill, TRACK_META } from "@/components/ui";
import { ActivityFeed } from "@/components/team/activity-feed";
import { GoalForm, RaceForm } from "@/components/team/team-forms";
import { LiveRefresh } from "@/components/live-refresh";
import { deleteGoalAction, joinRaceAction } from "@/app/actions/team";
import { cn } from "@/lib/cn";

export const metadata = { title: "Team" };

function fmtDuration(ms: number | null) {
  if (ms === null) return "—";
  const s = Math.round(ms / 1000);
  return s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ board?: string; track?: string }> }) {
  const sp = await searchParams;
  const { user, team, role } = await requireContext();
  const db = await getDb();
  const board = sp.board === "all-time" ? "all-time" : "weekly";
  const track = TrackIdSchema.safeParse(sp.track).success ? TrackIdSchema.parse(sp.track) : undefined;

  const [lb, rec, progress, feed, goals, liveRaces] = await Promise.all([
    leaderboard(db, user.id, team.id, { board, track }),
    recognition(db, user.id, team.id),
    teamProgress(db, user.id, team.id),
    recentActivity(db, user.id, team.id, 15),
    goalsWithProgress(db, user.id, team.id),
    db.select().from(races).where(and(eq(races.teamId, team.id), gte(races.endsAt, new Date(Date.now() - 7 * 86_400_000)))).orderBy(desc(races.startsAt)).limit(5),
  ]);
  const raceBoards = await Promise.all(liveRaces.map((r) => raceBoard(db, user.id, team.id, r.id)));
  const q = (b: string, t?: string) => `/team?board=${b}${t ? `&track=${t}` : ""}`;

  return (
    <div className="space-y-6">
      <LiveRefresh events={["leaderboard", "activity", "team.changed"]} />
      <PageHeader
        title={team.name}
        description={`${progress.length} member${progress.length === 1 ? "" : "s"}. Progress is shared; mistakes, answers and hint use are private.`}
        actions={
          <Link href="/scoring" className="btn-ghost">
            How scoring works
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 font-semibold">
              <Medal size={16} aria-hidden /> Leaderboard
            </h2>
            <nav aria-label="Leaderboard period" className="flex rounded-lg border border-border p-0.5 text-xs">
              {(["weekly", "all-time"] as const).map((b) => (
                <Link key={b} href={q(b, track)} aria-current={board === b ? "page" : undefined} className={cn("rounded-md px-2.5 py-1 capitalize", board === b ? "bg-surface-3 text-text" : "text-muted hover:text-text")}>
                  {b === "weekly" ? "This week" : "All time"}
                </Link>
              ))}
            </nav>
          </div>
          <nav aria-label="Track filter" className="mt-3 flex flex-wrap gap-1.5 text-xs">
            <Link href={q(board)} aria-current={!track ? "page" : undefined} className={cn("rounded-full border px-2.5 py-0.5", !track ? "border-primary text-text" : "border-border text-muted")}>
              All tracks
            </Link>
            {tracks.map((t) => (
              <Link key={t.id} href={q(board, t.id)} aria-current={track === t.id ? "page" : undefined} className={cn("rounded-full border px-2.5 py-0.5", track === t.id ? `${TRACK_META[t.id].border} ${TRACK_META[t.id].text}` : "border-border text-muted")}>
                {t.name}
              </Link>
            ))}
          </nav>
          {lb.window && (
            <p className="mt-2 text-xs text-faint">
              Week of {lb.window.start.toISOString().slice(0, 10)} · resets Monday 00:00 {lb.timezone}. Ties go to whoever reached the score first.
            </p>
          )}
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Team leaderboard, {board}{track ? `, ${track}` : ""}</caption>
            <thead>
              <tr className="text-left text-xs text-faint">
                <th scope="col" className="w-10 py-1.5 font-medium">#</th>
                <th scope="col" className="py-1.5 font-medium">Member</th>
                <th scope="col" className="py-1.5 text-right font-medium">Level</th>
                <th scope="col" className="py-1.5 text-right font-medium">XP</th>
              </tr>
            </thead>
            <tbody>
              {lb.rows.map((r) => (
                <tr key={r.userId} className={cn("border-t border-border", r.userId === user.id && "bg-primary/5")}>
                  <td className="py-2 font-mono text-xs text-muted">{r.rank}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <Avatar name={r.displayName} hue={r.hidden ? 220 : r.avatarHue} size={24} />
                      <span className={cn(r.userId === user.id && "font-semibold")}>{r.displayName}</span>
                      {r.userId === user.id && <span className="text-xs text-faint">(you)</span>}
                    </span>
                  </td>
                  <td className="py-2 text-right text-muted tabular-nums">{r.level}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{r.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold">Recognition</h2>
          <p className="mt-0.5 text-xs text-faint">Learning habits, not just points.</p>
          <RecList title="Most improved this week" empty="No mastery gains yet this week." items={rec.mostImproved.map((r) => ({ id: r.userId, name: r.displayName, value: `+${r.points} mastery pts` }))} />
          <RecList title="Review consistency (last 14 days)" empty="No reviews yet." items={rec.reviewConsistency.map((r) => ({ id: r.userId, name: r.displayName, value: `${r.days} day${r.days === 1 ? "" : "s"}` }))} />
          <RecList title="Cross-track proficiency" empty="Nobody is Proficient in 2+ tracks yet." items={rec.crossTrack.map((r) => ({ id: r.userId, name: r.displayName, value: `${r.tracks} tracks` }))} />
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Flag size={16} aria-hidden /> Team goals · week of {goals.weekStart}
        </h2>
        {goals.goals.length === 0 ? <p className="mt-2 text-sm text-muted">No cooperative goals this week{role === "admin" ? " — add one below." : "."}</p> : null}
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {goals.goals.map((g) => (
            <li key={g.id} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{g.title}</span>
                <span className="flex items-center gap-2 text-xs text-muted tabular-nums">
                  {g.value}/{g.target}
                  {g.done && <span className="text-success">✓ reached</span>}
                  {role === "admin" && (
                    <form action={deleteGoalAction.bind(null, g.id)}>
                      <button className="text-faint hover:text-danger" aria-label={`Remove goal ${g.title}`}>
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </form>
                  )}
                </span>
              </div>
              <Progress value={g.value} max={g.target} label={`${g.title}: ${g.value} of ${g.target}`} className="mt-2" color={g.done ? "var(--success)" : undefined} />
            </li>
          ))}
        </ul>
        {role === "admin" && (
          <div className="mt-4 border-t border-border pt-4">
            <GoalForm />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Timer size={16} aria-hidden /> Challenge races <span className="text-xs font-normal text-faint">optional</span>
        </h2>
        <p className="mt-1 text-sm text-muted">Timed races are opt-in and separate from XP and mastery, so nobody is penalised for taking their time. Race time starts when you join.</p>
        {raceBoards.filter(Boolean).length === 0 && <p className="mt-3 text-sm text-faint">No races in the last week.</p>}
        <ul className="mt-3 space-y-3">
          {raceBoards.map((rb) => {
            if (!rb) return null;
            const open = rb.race.endsAt.getTime() > Date.now();
            const mine = rb.entries.find((e) => e.userId === user.id);
            return (
              <li key={rb.race.id} className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{rb.race.title}</p>
                    <p className="text-xs text-faint">{open ? `Open until ${rb.race.endsAt.toUTCString()}` : "Finished"}</p>
                  </div>
                  {open && !mine?.finishedAt && (
                    <form action={joinRaceAction.bind(null, rb.race.id)}>
                      <button className="btn-secondary px-3 py-1.5 text-xs">{mine ? "Continue race" : "Join race"}</button>
                    </form>
                  )}
                </div>
                {rb.entries.length > 0 && (
                  <ol className="mt-2 space-y-1 text-sm">
                    {rb.entries.map((e, i) => (
                      <li key={e.userId} className="flex justify-between">
                        <span>
                          {e.durationMs !== null ? `${i + 1}. ` : ""}
                          {e.displayName}
                        </span>
                        <span className="font-mono text-xs text-muted">{e.finishedAt ? fmtDuration(e.durationMs) : "in progress"}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 border-t border-border pt-4">
          <RaceForm missions={missions.filter((m) => m.tier !== "advanced" && m.track !== "capstone").map((m) => ({ slug: m.slug, title: m.title, track: m.track }))} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <h2 className="font-semibold">Member progress</h2>
          {progress.length === 0 ? (
            <EmptyState title="No members" body="Invite teammates from Team admin." />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {progress
                .sort((a, b) => b.completed - a.completed || a.displayName.localeCompare(b.displayName))
                .map((m) => (
                  <li key={m.userId} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Avatar name={m.displayName} hue={m.avatarHue} size={28} />
                      <span className="font-medium">{m.displayName}</span>
                      {m.role === "admin" && <span className="rounded border border-border px-1 text-[10px] text-muted">admin</span>}
                      <span className="ml-auto text-xs text-muted">
                        Level {m.level} · {m.completed} missions · mastery: {m.masteryBand}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-2">
                      {tracks.map((t) => (
                        <div key={t.id}>
                          <Progress value={m.byTrack[t.id].done} max={m.byTrack[t.id].total || 1} label={`${m.displayName} ${t.name}: ${m.byTrack[t.id].done} of ${m.byTrack[t.id].total}`} color={TRACK_META[t.id].color} />
                          <p className="mt-0.5 text-[10px] text-faint">
                            {TRACK_META[t.id].short} {m.byTrack[t.id].done}/{m.byTrack[t.id].total}
                          </p>
                        </div>
                      ))}
                    </div>
                    {m.badges.length > 0 && (
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {m.badges.map((b) => (
                          <span key={b} className="rounded-full border border-js/30 bg-js/10 px-2 py-0.5 text-[11px] text-js" title={achievementById(b)?.description}>
                            {achievementById(b)?.name ?? b}
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Activity</h2>
          <ActivityFeed initial={feed.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))} />
        </Card>
      </div>
      <p className="text-xs text-faint">
        Track legend: {tracks.map((t) => <TrackPill key={t.id} track={t.id} className="mr-1" />)}
      </p>
    </div>
  );
}

function RecList({ title, items, empty }: { title: string; items: { id: string; name: string; value: string }[]; empty: string }) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-faint">{empty}</p>
      ) : (
        <ol className="mt-1.5 space-y-1 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2">
              <span>{i.name}</span>
              <span className="text-xs text-muted">{i.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
