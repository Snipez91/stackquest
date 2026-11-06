import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { requireUser } from "@/server/auth/current";
import { listUserTeams } from "@/server/teams";
import { signOutAction } from "@/app/actions/auth";
import { CreateTeamForm, JoinForm } from "./forms";

export const metadata = { title: "Set up your team" };

export default async function WelcomePage() {
  const user = await requireUser();
  const teams = await listUserTeams(await getDb(), user.id);
  if (teams.length) redirect("/dashboard");
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Hi {user.displayName.split(" ")[0]} — one more step</h1>
      <p className="mt-1 mb-6 text-sm text-muted">StackQuest is team-based. Join your team with the link an admin sent you, or start a new team and invite people.</p>
      <section aria-labelledby="join-h" className="card p-4">
        <h2 id="join-h" className="mb-3 font-semibold">Join with an invitation</h2>
        <JoinForm />
      </section>
      <div className="my-4 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
      <section aria-labelledby="create-h" className="card p-4">
        <h2 id="create-h" className="mb-3 font-semibold">Start a new team</h2>
        <CreateTeamForm />
        <p className="mt-3 text-xs text-faint">You&apos;ll be the team admin and can invite teammates from Team admin.</p>
      </section>
      <form action={signOutAction} className="mt-6">
        <button className="btn-ghost px-0 text-xs" type="submit">Sign out ({user.email})</button>
      </form>
    </div>
  );
}
