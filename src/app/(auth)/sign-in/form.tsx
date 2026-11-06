"use client";

import { useActionState } from "react";
import { signInAction, type FormState } from "@/app/actions/auth";
import { FormError, SubmitButton } from "@/components/forms";

export function SignInForm({ invite, next }: { invite?: string; next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signInAction, undefined);
  return (
    <form action={action} className="space-y-4" noValidate={false}>
      <FormError message={state?.error} />
      {invite && <input type="hidden" name="invite" value={invite} />}
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={state?.fields?.email} />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
