"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/app/actions/profile";
import { changePasswordAction, type FormState } from "@/app/actions/auth";
import { FormError, FormOk, SubmitButton } from "@/components/forms";
import { COMMON_TIME_ZONES } from "@/lib/time";

type U = { displayName: string; timezone: string; theme: string; reduceMotion: boolean; showOnLeaderboard: boolean; preferredTrack: string | null; isDemo: boolean };

export function ProfileForm({ user }: { user: U }) {
  const [state, action] = useActionState<FormState, FormData>(updateProfileAction, undefined);
  const zones = COMMON_TIME_ZONES.includes(user.timezone) ? COMMON_TIME_ZONES : [user.timezone, ...COMMON_TIME_ZONES];
  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />
      <FormOk message={state?.ok} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="s-name">Display name</label>
          <input id="s-name" name="displayName" className="input" defaultValue={user.displayName} required minLength={2} maxLength={40} />
        </div>
        <div>
          <label className="label" htmlFor="s-tz">Time zone</label>
          <select id="s-tz" name="timezone" className="input" defaultValue={user.timezone}>
            {zones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-faint">Used for review due dates and “today”.</p>
        </div>
        <div>
          <label className="label" htmlFor="s-theme">Theme</label>
          <select id="s-theme" name="theme" className="input" defaultValue={user.theme}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="s-track">Preferred path</label>
          <select id="s-track" name="preferredTrack" className="input" defaultValue={user.preferredTrack ?? ""}>
            <option value="">No preference</option>
            <option value="python">Python</option>
            <option value="linux">Linux</option>
            <option value="javascript">JavaScript</option>
            <option value="networking">Networking</option>
          </select>
        </div>
      </div>
      <fieldset className="space-y-2">
        <legend className="label">Preferences</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="reduceMotion" defaultChecked={user.reduceMotion} className="mt-0.5" />
          <span>Reduce motion <span className="block text-xs text-faint">Also respected automatically if your system asks for reduced motion.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="showOnLeaderboard" defaultChecked={user.showOnLeaderboard} className="mt-0.5" />
          <span>Show my name on leaderboards <span className="block text-xs text-faint">When off, teammates see “Private learner” in rankings. Your progress still counts toward team goals.</span></span>
        </label>
      </fieldset>
      <SubmitButton className="btn-primary" pendingText="Saving…">Save settings</SubmitButton>
    </form>
  );
}

export function PasswordForm({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, undefined);
  if (disabled) return <p className="text-sm text-muted">The demo account has no password to change.</p>;
  return (
    <form action={action} className="grid gap-3 sm:max-w-sm">
      <FormError message={state?.error} />
      <div>
        <label className="label" htmlFor="pw-cur">Current password</label>
        <input id="pw-cur" name="current" type="password" autoComplete="current-password" className="input" required />
      </div>
      <div>
        <label className="label" htmlFor="pw-new">New password</label>
        <input id="pw-new" name="next" type="password" autoComplete="new-password" className="input" required minLength={10} />
      </div>
      <div>
        <label className="label" htmlFor="pw-conf">Confirm new password</label>
        <input id="pw-conf" name="confirm" type="password" autoComplete="new-password" className="input" required minLength={10} />
      </div>
      <p className="text-xs text-faint">Changing your password signs you out everywhere.</p>
      <SubmitButton className="btn-secondary" pendingText="Updating…">Change password</SubmitButton>
    </form>
  );
}
