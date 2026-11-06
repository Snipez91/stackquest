/** Achievement definitions. Awarded server-side by src/server/achievements.ts. */
export const ACHIEVEMENTS = [
  { id: "first-mission", name: "First shift", description: "Complete your first mission.", icon: "flag" },
  { id: "independent-3", name: "Self-starter", description: "Solve 3 missions independently (at most one hint).", icon: "compass" },
  { id: "tier-beginner", name: "Foundations", description: "Finish every beginner mission in one track.", icon: "layers" },
  { id: "track-explorer", name: "Cross-trained", description: "Complete missions in 3 different tracks.", icon: "shuffle" },
  { id: "polymath", name: "Polymath", description: "Reach Proficient in at least one skill in all four tracks.", icon: "sparkles" },
  { id: "recall-7", name: "It stuck", description: "Pass a review 7 or more days after you last practised it.", icon: "brain" },
  { id: "recall-30", name: "Long memory", description: "Pass a review 30 or more days after you last practised it.", icon: "archive" },
  { id: "consistent-5", name: "Steady practice", description: "Do reviews on 5 different days (they don't need to be consecutive).", icon: "calendar" },
  { id: "comeback", name: "Comeback", description: "Pass a review you previously missed.", icon: "rotate" },
  { id: "transfer-1", name: "Transfer", description: "Pass a transfer challenge in a new context.", icon: "arrow" },
  { id: "capstone-1", name: "Incident commander", description: "Complete a cross-track capstone.", icon: "shield" },
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];
export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
