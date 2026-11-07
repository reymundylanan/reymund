"use client";

import { useState } from "react";
import { Hourglass } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateBookingBufferMinutes } from "@/lib/supabase/queries/spaSettings";
import { Spinner } from "./ui";

const CHOICES = [0, 5, 10, 15, 20, 30];

/**
 * Admin: minutes kept free after each booking before the same therapist's
 * next one — every booking screen (website, Front Desk, Multi-Branch) uses it,
 * so a service that runs a little long doesn't push later clients back.
 * Bookings already made stay as they are.
 */
export default function BufferSetting({ minutes, onSaved }: { minutes: number; onSaved: (text: string, tone?: "red") => void }) {
  const [value, setValue] = useState(minutes);
  const [saving, setSaving] = useState(false);

  async function save(next: number) {
    const previous = value;
    setValue(next);
    setSaving(true);
    const { error } = await updateBookingBufferMinutes(createClient(), next);
    setSaving(false);
    if (error) {
      setValue(previous);
      return onSaved(error, "red");
    }
    onSaved(next === 0 ? "Bookings can now be back to back." : `New bookings keep ${next} minutes between them.`);
  }

  return (
    <label className="flex w-fit flex-wrap items-center gap-2 rounded-full border border-[#e6d6ad] bg-white px-3 py-1.5 text-sm text-ink/75">
      <Hourglass className="h-4 w-4 text-coral-dark" />
      <span className="font-semibold text-ink">Time between bookings</span>
      <select
        value={CHOICES.includes(value) ? value : ""}
        onChange={(e) => save(Number(e.target.value))}
        disabled={saving}
        aria-label="Minutes kept free between a therapist's bookings"
        className="rounded-full border border-ink/10 bg-[#fbf6ea] px-2 py-0.5 text-sm font-semibold text-ink outline-none focus:border-coral"
      >
        {!CHOICES.includes(value) && <option value="">{value} min</option>}
        {CHOICES.map((n) => (
          <option key={n} value={n}>
            {n === 0 ? "None" : `${n} min`}
          </option>
        ))}
      </select>
      {saving && <Spinner />}
      <span className="text-xs text-ink/50">so a service that runs long doesn&apos;t delay the next client</span>
    </label>
  );
}
