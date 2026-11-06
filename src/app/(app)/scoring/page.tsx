import { MASTERY_BANDS, MASTERY_CAPS, REVIEW_INTERVALS, XP_RULES, evidencePoints, missionXp } from "@/lib/rules";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "How scoring works" };

export default function ScoringPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="How scoring and mastery work" description="Everything here is computed on the server from the rules below. Numbers on this page are read from the same code that awards them." />

      <Card className="p-5">
        <h2 className="font-semibold">XP: rewards demonstrated learning</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li>First completion of a mission: <strong className="text-text">{XP_RULES.missionBase.beginner} / {XP_RULES.missionBase.intermediate} / {XP_RULES.missionBase.advanced}</strong> XP (beginner / intermediate / advanced), +{XP_RULES.capstoneBonus} for capstones.</li>
          <li>Solved independently (at most one hint, no refresher or solution): <strong className="text-text">+{XP_RULES.independentBonusPct}%</strong> (e.g. {missionXp("intermediate", "python", true)} instead of {missionXp("intermediate", "python", false)}). Solving it independently later upgrades earlier supported credit once.</li>
          <li>Mission question right on the first try: <strong className="text-text">+{XP_RULES.questionFirstTry}</strong> each, once.</li>
          <li>Passed spaced review: <strong className="text-text">+{XP_RULES.reviewPass}</strong>, plus {XP_RULES.delayedReviewBonus} if you last practised it 7+ days ago. Up to {XP_RULES.dailyReviewXpCap} review XP per day.</li>
          <li>Passed transfer challenge: <strong className="text-text">+{XP_RULES.transferPass}</strong>. Achievements: +{XP_RULES.achievement} each.</li>
          <li><strong className="text-text">Repeats don&apos;t farm points.</strong> Replaying a mission is practice and earns no mission XP. Each review counts once per scheduled date.</li>
          <li>Hints stay available and useful. Using them marks a run “with support” — still progress, never a penalty below base XP.</li>
          <li>Time spent never earns XP. Timed races are optional and separate.</li>
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Leaderboards</h2>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li>Weekly boards run Monday 00:00 to Monday 00:00 in the <em>team&apos;s</em> time zone (set by admins), so everyone shares one boundary.</li>
          <li>Ties: whoever reached the total first ranks higher; then alphabetical.</li>
          <li>Per-track boards count only XP from that track. You can hide your name in Settings.</li>
          <li>Leaderboards never show answers, mistakes, or hint counts.</li>
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Mastery: a transparent estimate, not a certification</h2>
        <p className="mt-2 text-sm text-muted">Each skill has a 0–100 estimate built from evidence:</p>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Mastery evidence points</caption>
          <tbody className="text-muted">
            <tr className="border-t border-border"><td className="py-1.5">Completed with support</td><td className="text-right font-mono">+{evidencePoints("assisted_completion")}</td></tr>
            <tr className="border-t border-border"><td className="py-1.5">Completed independently</td><td className="text-right font-mono">+{evidencePoints("independent_completion")}</td></tr>
            <tr className="border-t border-border"><td className="py-1.5">Used in a later mission</td><td className="text-right font-mono">+{evidencePoints("applied_in_later_mission")}</td></tr>
            <tr className="border-t border-border"><td className="py-1.5">Passed review (1 / 7 / 30 days later)</td><td className="text-right font-mono">+{evidencePoints("review_pass", 1)} / +{evidencePoints("review_pass", 7)} / +{evidencePoints("review_pass", 30)}</td></tr>
            <tr className="border-t border-border"><td className="py-1.5">Missed review</td><td className="text-right font-mono">{evidencePoints("review_fail")}</td></tr>
            <tr className="border-t border-border"><td className="py-1.5">Transfer challenge passed / missed</td><td className="text-right font-mono">+{evidencePoints("transfer_pass")} / {evidencePoints("transfer_fail")}</td></tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm text-muted">
          Caps keep the estimate honest: without any independent evidence it stays at or below {MASTERY_CAPS.withoutIndependent}; without a passed review at least 7 days later it stays at or below {MASTERY_CAPS.withoutDelayedRecall}.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {MASTERY_BANDS.map((b) => (
            <li key={b.label}><strong>{b.label}</strong> ({b.min}+): <span className="text-muted">{b.description}</span></li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">We report three measures separately: <strong className="text-text">completion</strong> (missions done), <strong className="text-text">independent performance</strong> (share solved without heavy support) and <strong className="text-text">delayed recall</strong> (reviews passed 3+ days later).</p>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Spaced review</h2>
        <p className="mt-2 text-sm text-muted">
          After a mission, its review items come back after {REVIEW_INTERVALS.join(", ")} days. Correct and fairly sure or confident moves an item to the next interval; correct but unsure repeats the current interval; a miss sends it back to 1 day and offers a refresher. Each review uses a different equivalent variant, and queues mix tracks. Transfer challenges appear 3 days after a mission.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Achievements</h2>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {ACHIEVEMENTS.map((a) => <li key={a.id}><strong>{a.name}</strong> <span className="text-muted">— {a.description}</span></li>)}
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Integrity limits</h2>
        <p className="mt-2 text-sm text-muted">
          Linux and networking work is graded on the server by replaying your commands in a fresh copy of the simulated lab. Python and JavaScript run in your browser in an isolated sandbox, so their check results are reported by your browser — a determined person could fake them. Questions are graded on the server. StackQuest is built for honest team learning, not proctored exams.
        </p>
      </Card>
    </div>
  );
}
