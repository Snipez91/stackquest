import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/current";
import { SignUpForm } from "./form";

export const metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(sp.invite ? `/invite/${encodeURIComponent(sp.invite)}` : "/dashboard");
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {sp.invite ? "You'll join the team that invited you right after this." : "You can start a team or join one with an invite link next."}
      </p>
      <SignUpForm invite={sp.invite} />
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link className="text-primary underline underline-offset-2" href={sp.invite ? `/sign-in?invite=${encodeURIComponent(sp.invite)}` : "/sign-in"}>
          Sign in
        </Link>
      </p>
    </>
  );
}
