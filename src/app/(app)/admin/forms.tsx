"use client";

import { useActionState, useState, useTransition } from "react";
import { useOrigin } from "@/lib/use-browser";
import { changeRoleAction, createInviteAction, muteMemberAction, removeMemberAction, revokeInviteAction, updateTeamAction, type InviteState } from "@/app/actions/team";
import type { FormState } from "@/app/actions/auth";
import { FormError, FormOk, SubmitButton } from "@/components/forms";
import { COMMON_TIME_ZONES } from "@/lib/time";

export function InviteForm() {
  const [state, action] = useActionState<InviteState, FormData>(createInviteAction, undefined);
  const [copied, setCopied] = useState(false);
  const origin = useOrigin();
  const link = state?.link ? (state.link.startsWith("http") ? state.link : origin + state.link) : null;
  return (
    <form action={action} className="space-y-3">
      <FormError message={state?.error} />
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label text-xs" htmlFor="i-label">Label (optional)</label>
          <input id="i-label" name="label" className="input" maxLength={60} placeholder="e.g. For Sam" />
        </div>
        <div>
          <label className="label text-xs" htmlFor="i-exp">Expires after</label>
          <select id="i-exp" name="expiresInHours" className="input" defaultValue="72">
            <option value="1">1 hour</option>
            <option value="24">1 day</option>
            <option value="72">3 days</option>
            <option value="168">7 days</option>
            <option value="720">30 days</option>
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="i-uses">Uses</label>
          <select id="i-uses" name="maxUses" className="input" defaultValue="1">
            <option value="1">1 person</option>
            <option value="5">Up to 5</option>
            <option value="25">Up to 25</option>
          </select>
        </div>
        <div>
          <label className="label text-xs" htmlFor="i-role">Role</label>
          <select id="i-role" name="role" className="input" defaultValue="member">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      <SubmitButton className="btn-primary" pendingText="Creating…">Create invitation link</SubmitButton>
      {link && (
        <div role="status" className="rounded-lg border border-success/50 bg-success/8 p-3">
          <p className="text-sm">{state?.ok}</p>
          <div className="mt-2 flex gap-2">
            <label htmlFor="i-link" className="sr-only">Invitation link</label>
            <input id="i-link" readOnly value={link} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn-secondary shrink-0"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* clipboard blocked: the field is selectable */
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost px-2 py-1 text-xs text-danger" disabled={pending} onClick={() => confirm("Revoke this invitation? The link will stop working immediately.") && start(() => revokeInviteAction(id))}>
      {pending ? "Revoking…" : "Revoke"}
    </button>
  );
}

export function MemberControls({ userId, role, isSelf, muted }: { userId: string; role: "admin" | "member"; isSelf: boolean; muted: boolean }) {
  const [msg, setMsg] = useState<FormState>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<FormState>) => start(async () => setMsg(await fn()));
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <label className="sr-only" htmlFor={`role-${userId}`}>Role</label>
      <select id={`role-${userId}`} className="input w-auto py-1 text-xs" value={role} disabled={pending} onChange={(e) => run(() => changeRoleAction(userId, e.target.value as "admin" | "member"))}>
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>
      {!isSelf && (
        <>
          <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => run(() => muteMemberAction(userId, muted ? 0 : 60 * 24))}>
            {muted ? "Unmute" : "Mute 24h"}
          </button>
          <button className="btn-ghost px-2 py-1 text-xs text-danger" disabled={pending} onClick={() => confirm("Remove this member from the team? They lose access immediately.") && run(() => removeMemberAction(userId))}>
            Remove
          </button>
        </>
      )}
      {msg?.error && <p role="alert" className="w-full text-right text-xs text-danger">{msg.error}</p>}
      {msg?.ok && <p role="status" className="w-full text-right text-xs text-success">{msg.ok}</p>}
    </div>
  );
}

export function TeamSettingsForm({ name, timezone }: { name: string; timezone: string }) {
  const [state, action] = useActionState<FormState, FormData>(updateTeamAction, undefined);
  const zones = COMMON_TIME_ZONES.includes(timezone) ? COMMON_TIME_ZONES : [timezone, ...COMMON_TIME_ZONES];
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="sm:col-span-3">
        <FormError message={state?.error} />
        <FormOk message={state?.ok} />
      </div>
      <div>
        <label className="label text-xs" htmlFor="t-name">Team name</label>
        <input id="t-name" name="name" className="input" defaultValue={name} required minLength={2} maxLength={50} />
      </div>
      <div>
        <label className="label text-xs" htmlFor="t-tz">Leaderboard time zone</label>
        <select id="t-tz" name="timezone" className="input" defaultValue={timezone}>
          {zones.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
      </div>
      <SubmitButton className="btn-secondary" pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}
