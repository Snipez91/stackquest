"use client";

import { useActionState, useEffect, useState } from "react";
import { createTeamAction, joinByLinkAction } from "@/app/actions/team";
import type { FormState } from "@/app/actions/auth";
import { FormError, SubmitButton } from "@/components/forms";

export function CreateTeamForm() {
  const [state, action] = useActionState<FormState, FormData>(createTeamAction, undefined);
  const [tz, setTz] = useState("UTC");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);
  return (
    <form action={action} className="space-y-3">
      <FormError message={state?.error} />
      <input type="hidden" name="timezone" value={tz} />
      <div>
        <label htmlFor="team-name" className="label">Team name</label>
        <input id="team-name" name="name" required minLength={2} maxLength={50} className="input" placeholder="e.g. Platform Team" />
        <p className="mt-1 text-xs text-faint">Weekly leaderboards reset Monday 00:00 in {tz}. Admins can change this later.</p>
      </div>
      <SubmitButton pendingText="Creating…">Create team</SubmitButton>
    </form>
  );
}

export function JoinForm() {
  const [state, action] = useActionState<FormState, FormData>(joinByLinkAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormError message={state?.error} />
      <div>
        <label htmlFor="invite-link" className="label">Invitation link</label>
        <input id="invite-link" name="link" required className="input font-mono text-xs" placeholder="https://…/invite/…" />
      </div>
      <SubmitButton className="btn-secondary w-full" pendingText="Joining…">Join team</SubmitButton>
    </form>
  );
}
