"use client";

import { useActionState } from "react";
import { useBrowserTimeZone } from "@/lib/use-browser";
import { signUpAction, type FormState } from "@/app/actions/auth";
import { FormError, SubmitButton } from "@/components/forms";

export function SignUpForm({ invite }: { invite?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, undefined);
  const tz = useBrowserTimeZone();
  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />
      {invite && <input type="hidden" name="invite" value={invite} />}
      <input type="hidden" name="timezone" value={state?.fields?.timezone ?? tz} />
      <div>
        <label htmlFor="displayName" className="label">Display name</label>
        <input id="displayName" name="displayName" autoComplete="nickname" required minLength={2} maxLength={40} className="input" defaultValue={state?.fields?.displayName} />
        <p className="mt-1 text-xs text-faint">Shown to your teammates.</p>
      </div>
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={state?.fields?.email} />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="input" aria-describedby="pw-help" />
        <p id="pw-help" className="mt-1 text-xs text-faint">At least 10 characters. A passphrase works well.</p>
      </div>
      <p className="text-xs text-faint">Time zone for your review schedule: <span className="text-muted">{tz}</span> (change any time in Settings).</p>
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}
