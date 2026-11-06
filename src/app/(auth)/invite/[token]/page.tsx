import Link from "next/link";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth/current";
import { previewInvite } from "@/server/teams";
import { acceptInviteAction } from "@/app/actions/team";
import { SubmitButton } from "@/components/forms";

export const metadata = { title: "Team invitation" };

const MESSAGES = {
  expired: { title: "This invitation has expired", body: "Invitations expire for security. Ask your team admin to send a new link." },
  revoked: { title: "This invitation was revoked", body: "An admin cancelled this link. Ask them for a new one if you still need access." },
  used_up: { title: "This invitation has already been used", body: "Each link can be used a limited number of times. Ask your team admin for a new one." },
  invalid: { title: "We couldn't find that invitation", body: "Check that you copied the whole link. If it still doesn't work, ask your team admin for a new one." },
} as const;

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, user] = await Promise.all([previewInvite(await getDb(), token), currentUser()]);
  if (preview.status !== "valid") {
    const m = MESSAGES[preview.status];
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{m.title}</h1>
        <p className="mt-2 text-sm text-muted">{m.body}</p>
        <Link href={user ? "/dashboard" : "/sign-in"} className="btn-secondary mt-6">
          {user ? "Go to dashboard" : "Sign in"}
        </Link>
      </div>
    );
  }
  const accept = acceptInviteAction.bind(null, token);
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-faint">Team invitation</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Join {preview.teamName}</h1>
      <p className="mt-2 text-sm text-muted">
        {preview.memberCount} {preview.memberCount === 1 ? "person is" : "people are"} learning here. You&apos;ll join as{" "}
        <strong className="text-text">{preview.role === "admin" ? "an admin" : "a member"}</strong>. This link expires{" "}
        <time dateTime={preview.expiresAt.toISOString()}>{preview.expiresAt.toUTCString()}</time>.
      </p>
      <div className="mt-6 space-y-3">
        {user ? (
          <form action={accept}>
            <p className="mb-3 text-sm text-muted">Signed in as {user.email}.</p>
            <SubmitButton pendingText="Joining…">Join team</SubmitButton>
          </form>
        ) : (
          <>
            <Link href={`/sign-up?invite=${encodeURIComponent(token)}`} className="btn-primary w-full">
              Create an account and join
            </Link>
            <Link href={`/sign-in?invite=${encodeURIComponent(token)}`} className="btn-secondary w-full">
              I already have an account
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
