# Mastery, scoring and review model

The source of truth is `src/lib/rules.ts`. The in-app page **How scoring works**
reads the same constants, so what learners see always matches what the code does.

## Three separate measures

Completing a mission isn't treated as proof of learning. StackQuest reports three
measures separately (dashboard, profile, per track):

1. **Completion:** missions finished.
2. **Independent performance:** the share of completed missions solved with at most
   one hint and without the refresher or the solution.
3. **Delayed recall:** the pass rate of reviews taken 3 or more days after the
   learner last practised that item.

## Skill mastery estimate (0–100)

Each skill accumulates evidence:

| Evidence | Points |
| --- | --- |
| Mission completed with support | +15 |
| Mission completed independently | +25 |
| Skill applied in a later mission (without re-teaching) | +10 |
| Review passed (grows with the delay: 1 d ≈ 6.6, 7 d ≈ 10.2, 30 d = 24) | +6 + 0.6 × min(days, 30) |
| Review missed | −8 |
| Transfer challenge passed / missed | +15 / −5 |

Each evidence row has a unique source key: one per mission completion type, one per
scheduled review date. That makes it impossible to farm mastery by repetition.

**Caps:** without any independent evidence the estimate stays at or below 45. Without
a review passed at least 7 days after the last practice, it stays at or below 70.
Only delayed recall can take a skill to **Strong**.

| Band | Score | Meaning |
| --- | --- | --- |
| Strong | 80+ | Solved independently and recalled after a week or more |
| Proficient | 55–79 | Solid evidence; delayed reviews will confirm it |
| Developing | 30–54 | Practised; recall not yet established |
| Introduced | 1–29 | Seen in a mission |

This is a transparent heuristic, not a psychometric model or a certification.

## Spaced review

- Completing a mission schedules each review item for tomorrow (stage 0).
- Intervals by stage: **1, 3, 7, 14, 30, 60 days**.
- Correct + "fairly sure" or "confident" → next stage. Correct + "unsure" → the same
  interval again. Incorrect → back to 1 day, plus a refresher and a link back to the
  mission.
- Each review rotates through **equivalent variants** (different numbers, names or
  framings), so recall is tested rather than recognition.
- Queues **interleave tracks** so consecutive cards differ.
- Items due today are reviewable; early reviews are refused (spacing is the point).
  One graded review per scheduled date.
- A **transfer challenge** (the same skill in a new context) appears 3 days after a
  mission.
- "Today" means the learner's own time zone (Settings).

## Retrieval before answers

Mission questions don't reveal the explanation or the correct answer until the
learner either answers correctly or has tried twice. Review cards ask first and
explain after. The diagnostic gives no feedback during the check.

## XP

| Event | XP |
| --- | --- |
| First completion (beginner / intermediate / advanced) | 100 / 150 / 200 (+100 for capstones) |
| Independent bonus | +50% |
| Later independent solve after a supported first completion | the difference, once |
| Mission question right first try | +10 each, once |
| Spaced review passed | +15 (+10 if delay ≥ 7 days), capped at 200 per day |
| Transfer challenge passed | +40 |
| Achievement | +25 |

Replaying a mission earns no XP. Time spent never earns XP. Hints never take XP
below the base amount.

Leaderboards are aggregations of `xp_events`, which are append-only and unique on
`(user, team, idempotency key)`. Weekly boards use the **team** time zone (Monday
00:00 to Monday 00:00). Ties go to whoever reached the total first, then
alphabetically.
