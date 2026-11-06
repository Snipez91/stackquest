import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/current";
import { demoSignInAction } from "@/app/actions/auth";
import { SignInForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ invite?: string; next?: string; changed?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(sp.invite ? `/invite/${encodeURIComponent(sp.invite)}` : "/dashboard");
  const demo = process.env.DEMO_MODE === "true";
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {sp.invite ? "Sign in to accept your team invitation." : "Welcome back. Your reviews and missions are waiting."}
      </p>
      {sp.changed && (
        <p role="status" className="mb-4 rounded-lg border border-success/50 bg-success/10 px-3 py-2 text-sm">
          Password changed. Sign in again on each device.
        </p>
      )}
      <SignInForm invite={sp.invite} next={sp.next} />
      <p className="mt-6 text-sm text-muted">
        New here?{" "}
        <Link className="text-primary underline underline-offset-2" href={sp.invite ? `/sign-up?invite=${encodeURIComponent(sp.invite)}` : "/sign-up"}>
          Create an account
        </Link>
      </p>
      {demo && (
        <div className="mt-8 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-semibold">Demo mode is on</p>
          <p className="mt-1 text-sm text-muted">
            Explore with a fictional team and made-up activity. Nothing you see there is real usage data.
          </p>
          <form action={demoSignInAction} className="mt-3">
            <button className="btn-secondary w-full" type="submit">Explore the demo team</button>
          </form>
        </div>
      )}
    </>
  );
}
