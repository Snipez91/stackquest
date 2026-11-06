"use client";

import { useActionState } from "react";
import { createGoalAction, createRaceAction } from "@/app/actions/team";
import type { FormState } from "@/app/actions/auth";
import { FormError, FormOk, SubmitButton } from "@/components/forms";

export function GoalForm() {
  const [state, action] = useActionState<FormState, FormData>(createGoalAction, undefined);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
      <div className="sm:col-span-4">
        <FormError message={state?.error} />
        <FormOk message={state?.ok} />
      </div>
      <div>
        <label htmlFor="g-title" className="label text-xs">Goal</label>
        <input id="g-title" name="title" className="input" required minLength={3} maxLength={80} placeholder="e.g. Everyone tries a networking mission" />
      </div>
      <div>
        <label htmlFor="g-metric" className="label text-xs">Measure</label>
        <select id="g-metric" name="metric" className="input">
          <option value="missions">Missions completed</option>
          <option value="independent">Independent solves</option>
          <option value="reviews">Reviews passed</option>
          <option value="tracks_touched">Member-tracks practised</option>
        </select>
      </div>
      <div>
        <label htmlFor="g-target" className="label text-xs">Target</label>
        <input id="g-target" name="target" type="number" min={1} max={1000} defaultValue={10} className="input w-24" />
      </div>
      <SubmitButton className="btn-secondary" pendingText="Adding…">Add goal</SubmitButton>
    </form>
  );
}

export function RaceForm({ missions }: { missions: { slug: string; title: string; track: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(createRaceAction, undefined);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <div className="sm:col-span-3">
        <FormError message={state?.error} />
        <FormOk message={state?.ok} />
      </div>
      <div>
        <label htmlFor="r-mission" className="label text-xs">Mission</label>
        <select id="r-mission" name="mission" className="input">
          {missions.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.title} ({m.track})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="r-hours" className="label text-xs">Open for</label>
        <select id="r-hours" name="hours" className="input" defaultValue="24">
          <option value="2">2 hours</option>
          <option value="24">1 day</option>
          <option value="72">3 days</option>
          <option value="168">1 week</option>
        </select>
      </div>
      <SubmitButton className="btn-secondary" pendingText="Starting…">Start race</SubmitButton>
    </form>
  );
}
