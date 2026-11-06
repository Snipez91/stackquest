import { and, eq } from "drizzle-orm";
import { missionsForTrack } from "@/content";
import { missionXp } from "@/lib/rules";
import { addDays, localDate } from "@/lib/time";
import type { Db } from "./db";
import {
  achievements,
  activity,
  attempts,
  channels,
  mastery,
  memberships,
  messages,
  reviewStates,
  teamGoals,
  teams,
  users,
  xpEvents,
} from "./db/schema";
import { hashPassword, randomToken } from "./auth/password";
import { DEFAULT_CHANNELS } from "./teams";
import { weekStartDay } from "@/lib/time";

/**
 * DEMO MODE ONLY (DEMO_MODE=true). Seeds a clearly labelled fictional team so
 * people can explore without inviting anyone. Demo users can't sign in with a
 * password; the "Explore the demo" button signs in as the demo learner and the
 * UI shows a persistent "Demo data — fictional" banner.
 */

export const DEMO_TEAM_NAME = "Lumen Demo Crew (fictional)";
export const DEMO_LEARNER_EMAIL = "demo.learner@stackquest.invalid";

const PEOPLE = [
  { name: "Riley Chen", handle: "riley", hue: 190, tracks: ["python", "linux"], n: 6 },
  { name: "Noor Haddad", handle: "noor", hue: 330, tracks: ["networking", "linux"], n: 5 },
  { name: "Mateo Silva", handle: "mateo", hue: 40, tracks: ["javascript"], n: 4 },
  { name: "Ada Okoye", handle: "ada", hue: 270, tracks: ["python", "javascript", "networking"], n: 7 },
  { name: "Kai Lindqvist", handle: "kai", hue: 120, tracks: ["linux"], n: 2 },
] as const;

export async function ensureDemoData(db: Db) {
  const [found] = await db.select().from(teams).where(and(eq(teams.isDemo, true), eq(teams.name, DEMO_TEAM_NAME))).limit(1);
  if (found) return found;

  const unusable = await hashPassword(randomToken()); // nobody knows this password
  const [team] = await db.insert(teams).values({ name: DEMO_TEAM_NAME, timezone: "UTC", isDemo: true }).returning();
  await db.insert(channels).values(DEFAULT_CHANNELS.map((c) => ({ ...c, teamId: team.id })));

  const [learner] = await db
    .insert(users)
    .values({ email: DEMO_LEARNER_EMAIL, displayName: "You (demo learner)", handle: "demolearner", passwordHash: unusable, isDemo: true, activeTeamId: team.id, avatarHue: 210 })
    .onConflictDoUpdate({ target: users.email, set: { activeTeamId: team.id } })
    .returning();
  await db.insert(memberships).values({ teamId: team.id, userId: learner.id, role: "admin" }).onConflictDoNothing();

  const now = Date.now();
  const today = localDate("UTC");
  const general = (await db.select().from(channels).where(and(eq(channels.teamId, team.id), eq(channels.key, "general"))))[0];
  const ids: Record<string, string> = {};

  for (const [i, p] of PEOPLE.entries()) {
    const [u] = await db
      .insert(users)
      .values({ email: `${p.handle}@demo.stackquest.invalid`, displayName: `${p.name} (demo)`, handle: `demo${p.handle}`, passwordHash: unusable, isDemo: true, activeTeamId: team.id, avatarHue: p.hue })
      .onConflictDoUpdate({ target: users.email, set: { activeTeamId: team.id } })
      .returning();
    ids[p.handle] = u.id;
    await db.insert(memberships).values({ teamId: team.id, userId: u.id, role: i === 0 ? "admin" : "member", lastSeenAt: i < 2 ? new Date(now) : new Date(now - 86_400_000 * i) }).onConflictDoNothing();

    let made = 0;
    for (const track of p.tracks) {
      for (const m of missionsForTrack(track)) {
        if (made >= p.n) break;
        if (m.tier === "advanced") continue;
        const completedAt = new Date(now - (p.n - made) * 26 * 3_600_000 - i * 3_600_000);
        const independent = (made + i) % 3 !== 0;
        await db.insert(attempts).values({
          userId: u.id,
          teamId: team.id,
          missionSlug: m.slug,
          missionVersion: m.version,
          status: "completed",
          practicalPassed: true,
          practicalVerifiedBy: "server",
          independent,
          hintsUsed: independent ? 0 : 2,
          startedAt: new Date(completedAt.getTime() - 25 * 60_000),
          completedAt,
          durationMs: 25 * 60_000,
        });
        await db.insert(xpEvents).values({ userId: u.id, teamId: team.id, amount: missionXp(m.tier, m.track, independent), reason: `Completed ${m.title}`, track: m.track, idempotencyKey: `mission:${m.slug}`, createdAt: completedAt });
        await db.insert(activity).values({ teamId: team.id, userId: u.id, kind: "mission_completed", payload: { name: `${p.name} (demo)`, mission: m.title, slug: m.slug, track: m.track, tier: m.tier }, createdAt: completedAt });
        for (const s of m.skills) {
          await db
            .insert(mastery)
            .values({ userId: u.id, teamId: team.id, skillId: s, score: independent ? 40 + ((made * 7) % 30) : 25, completions: 1, independentCompletions: independent ? 1 : 0, lastPracticedAt: completedAt })
            .onConflictDoNothing();
        }
        made++;
      }
    }
    if (made > 0) {
      await db.insert(achievements).values({ userId: u.id, teamId: team.id, achievementId: "first-mission", earnedAt: new Date(now - 5 * 86_400_000) }).onConflictDoNothing();
    }
    if (p.tracks.length >= 3) {
      await db.insert(achievements).values({ userId: u.id, teamId: team.id, achievementId: "track-explorer" }).onConflictDoNothing();
    }
  }

  // The demo learner has one completed mission and reviews due today so the review queue isn't empty.
  const first = missionsForTrack("python")[0] ?? missionsForTrack("linux")[0];
  if (first) {
    const completedAt = new Date(now - 2 * 86_400_000);
    await db.insert(attempts).values({ userId: learner.id, teamId: team.id, missionSlug: first.slug, missionVersion: first.version, status: "completed", practicalPassed: true, practicalVerifiedBy: "client", independent: true, completedAt, startedAt: new Date(completedAt.getTime() - 20 * 60_000), durationMs: 20 * 60_000 });
    await db.insert(xpEvents).values({ userId: learner.id, teamId: team.id, amount: missionXp(first.tier, first.track, true), reason: `Completed ${first.title} independently`, track: first.track, idempotencyKey: `mission:${first.slug}`, createdAt: completedAt });
    for (const r of first.review) {
      await db.insert(reviewStates).values({ userId: learner.id, teamId: team.id, itemId: r.id, skillId: r.skill, missionSlug: first.slug, kind: "review", stage: 0, dueOn: today, createdAt: completedAt }).onConflictDoNothing();
    }
    await db.insert(reviewStates).values({ userId: learner.id, teamId: team.id, itemId: `transfer:${first.slug}`, skillId: first.skills[0], missionSlug: first.slug, kind: "transfer", stage: 0, dueOn: addDays(today, 1), createdAt: completedAt }).onConflictDoNothing();
    for (const s of first.skills) {
      await db.insert(mastery).values({ userId: learner.id, teamId: team.id, skillId: s, score: 25, completions: 1, independentCompletions: 1, lastPracticedAt: completedAt }).onConflictDoNothing();
    }
  }

  const week = weekStartDay("UTC");
  await db.insert(teamGoals).values([
    { teamId: team.id, title: "Complete 12 missions as a team", metric: "missions", target: 12, weekStart: week, createdBy: ids.riley },
    { teamId: team.id, title: "Pass 25 spaced reviews", metric: "reviews", target: 25, weekStart: week, createdBy: ids.riley },
  ]);

  const chat = [
    { who: "riley", body: "Morning all. Reminder: reviews take five minutes and they're what make this stick. Queue's on the Review tab.", ago: 30 },
    { who: "noor", body: "Just finished the DNS mission. The bit that clicked: `ping 10.20.0.15` working but `ping api.lumen.internal` failing means the network path is fine and resolution isn't.", ago: 22 },
    { who: "mateo", body: "@demonoor nice. I'm stuck on the fetch error handling one — spoiler-free hint?", ago: 20 },
    { who: "noor", body: "Check what `fetch` does with a 500. ||It resolves — only network failures reject, so you need to check response.ok yourself.||", ago: 18 },
    { who: "ada", body: "Snippet for anyone doing the Python log mission:\n```python\nfor line in lines:\n    try:\n        record = parse(line)\n    except ValueError as err:\n        skipped.append((line, str(err)))\n```", ago: 9 },
  ];
  for (const [i, c] of chat.entries()) {
    await db.insert(messages).values({ channelId: general.id, teamId: team.id, userId: ids[c.who], body: c.body, clientId: `demo-seed-${i}`, createdAt: new Date(now - c.ago * 60_000) });
  }
  return team;
}

export async function demoLearner(db: Db) {
  const [u] = await db.select().from(users).where(eq(users.email, DEMO_LEARNER_EMAIL)).limit(1);
  return u ?? null;
}
