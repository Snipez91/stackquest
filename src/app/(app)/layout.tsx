import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { reviewStates } from "@/server/db/schema";
import { requireContext } from "@/server/auth/current";
import { listUserTeams } from "@/server/teams";
import { localDate } from "@/lib/time";
import { RealtimeProvider } from "@/components/realtime";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, team, role } = await requireContext();
  const db = await getDb();
  const [teams, [due]] = await Promise.all([
    listUserTeams(db, user.id),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviewStates)
      .where(and(eq(reviewStates.userId, user.id), eq(reviewStates.teamId, team.id), lte(reviewStates.dueOn, localDate(user.timezone)), isNull(reviewStates.retiredAt))),
  ]);
  return (
    <RealtimeProvider userId={user.id}>
      <AppShell
        me={{ id: user.id, handle: user.handle, role, displayName: user.displayName, avatarHue: user.avatarHue }}
        team={team}
        teams={teams}
        isAdmin={role === "admin"}
        dueCount={Number(due?.n ?? 0)}
      >
        {children}
      </AppShell>
    </RealtimeProvider>
  );
}
