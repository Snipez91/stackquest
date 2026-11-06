import { MissionSchema, SkillSchema, TrackSchema, type Mission, type Skill, type Track, type TrackId } from "./schema";
import { tracks as rawTracks } from "./tracks";
import { pythonSkills } from "./skills/python";
import { linuxSkills } from "./skills/linux";
import { javascriptSkills } from "./skills/javascript";
import { networkingSkills } from "./skills/networking";
import { pythonMissions } from "./missions/python";
import { linuxMissions } from "./missions/linux";
import { javascriptMissions } from "./missions/javascript";
import { networkingMissions } from "./missions/networking";
import { capstoneMissions } from "./missions/capstone";

/**
 * The curriculum registry. Everything is parsed through the zod schemas at
 * module load, so invalid content fails fast in dev, tests, and the build.
 */

export const tracks: Track[] = rawTracks.map((t) => TrackSchema.parse(t));
export const skills: Skill[] = [...pythonSkills, ...linuxSkills, ...javascriptSkills, ...networkingSkills].map((s) =>
  SkillSchema.parse(s),
);
export const missions: Mission[] = [
  ...pythonMissions,
  ...linuxMissions,
  ...javascriptMissions,
  ...networkingMissions,
  ...capstoneMissions,
].map((m) => {
  const r = MissionSchema.safeParse(m);
  if (!r.success) {
    throw new Error(`Invalid mission ${(m as { slug?: string }).slug}: ${r.error.message}`);
  }
  return r.data;
});

const bySlug = new Map(missions.map((m) => [m.slug, m]));
const skillById = new Map(skills.map((s) => [s.id, s]));
const tierRank = { beginner: 0, intermediate: 1, advanced: 2 } as const;

export function getMission(slug: string): Mission | undefined {
  return bySlug.get(slug);
}
export function getSkill(id: string): Skill | undefined {
  return skillById.get(id);
}
export function getTrack(id: string): Track | undefined {
  return tracks.find((t) => t.id === id);
}
export function missionsForTrack(track: TrackId): Mission[] {
  return missions
    .filter((m) => m.track === track)
    .sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || a.order - b.order);
}
export function skillsForTrack(track: TrackId): Skill[] {
  return skills.filter((s) => s.track === track);
}
export function reviewItemById(id: string) {
  for (const m of missions) {
    const r = m.review.find((x) => x.id === id);
    if (r) return { mission: m, item: r };
  }
  return undefined;
}
export const missionCount = missions.length;
