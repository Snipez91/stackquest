import { requireContext } from "@/server/auth/current";
import { Card, PageHeader } from "@/components/ui";
import { removeMemberAction } from "@/app/actions/team";
import { ProfileForm, PasswordForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, team } = await requireContext();
  const leave = async () => {
    "use server";
    await removeMemberAction(user.id);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={`Signed in as ${user.email}`} />
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Profile and preferences</h2>
        <ProfileForm user={user} />
      </Card>
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Password</h2>
        <PasswordForm disabled={user.isDemo} />
      </Card>
      <Card className="border-danger/30 p-5">
        <h2 className="font-semibold">Leave {team.name}</h2>
        <p className="mt-1 text-sm text-muted">You&apos;ll lose access to this team&apos;s chat and leaderboards. Your learning history for this team is kept if you&apos;re invited back.</p>
        <details className="mt-3">
          <summary className="btn-danger cursor-pointer list-none">Leave team…</summary>
          <form action={leave} className="mt-3 flex items-center gap-3">
            <span className="text-sm">Are you sure?</span>
            <button className="btn-danger" type="submit">Yes, leave {team.name}</button>
          </form>
        </details>
      </Card>
    </div>
  );
}
