# Staff Shift Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let front desk mark a branch staff member off (full day, morning, or afternoon) for a date, and make the public booking flow actually refuse to book that professional during a period they're off.

**Architecture:** Repurpose the existing-but-unused `staff_shifts` table as an exceptions table (a row = "off"; no row = on duty). A new query helper module (`staffShifts.ts`) is the single place that reads/writes it. The Front Desk Staff Schedule page gets a lifted-state client wrapper (`StaffScheduleClient.tsx`) so the date-nav header and the staff status grid share one selected date; an Add Block modal writes off-records. `BookingModal.tsx` reads the same table for one professional across a visible month and disables dates/times accordingly, with a submit-time re-check for the race window.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (`@supabase/supabase-js` client via `@/lib/supabase/client`), Tailwind v4. No automated test framework exists in this repo — verification is manual (`npx tsc --noEmit` after each code task, then the `run` skill for behavior).

**Spec:** `docs/superpowers/specs/2026-09-24-staff-shift-availability-design.md`

## Global Constraints

- Morning/afternoon boundary is a fixed **1:00 PM** cutoff, not branch hours. A `morning` off-record disables slots strictly before 13:00; an `afternoon` off-record disables slots at or after 13:00. The 1:00 PM slot itself is only disabled by an `afternoon` record, never a `morning` one.
- One staff member has at most one off-record per date. Adding a new block for a staff member + date **replaces** (delete-then-insert) any existing record for that same staff member + date — never a duplicate row.
- Gating only applies when `professionalId` is a specific staff member. `professionalId === "any"` (or unset) is never restricted.
- `staff_shifts` RLS: public `select` (the booking flow reads it without being staff), `admin`/`front_desk` only for `insert`/`update`/`delete` (matches the existing `staff_members`/`appointments` staff-role policy pattern already in this codebase).
- Follow existing patterns exactly: Supabase browser client via `createClient()` from `@/lib/supabase/client`; date keys as `YYYY-MM-DD` strings; staff/branch data always scoped by `profile.branchId` from `useStaffProfile()`.

## Review Focus

- Exact 1:00 PM boundary: a `morning` off-record must leave the 1:00 PM slot bookable; an `afternoon` off-record must disable it. An off-by-one here silently over- or under-blocks a real customer.
- Switching `professionalId` from a specific staff member back to `"any"` mid-flow must immediately clear `staffOffDays` and re-enable every date/slot — stale disabled state would block a booking that should be allowed.
- Two different staff members with different off-periods on the same date must render distinct, correct statuses in the Staff Schedule grid — a fetch or state bug here could show one person's off-status on another's row.
- Submit-time race: a front-desk block added after the customer opened the calendar but before they hit confirm must be caught at submit (not just silently double-booked), reusing the existing `setSaveError`-then-`return false` pattern already in `saveBooking()`.
- Adding a new block for a staff member who already has one for that date must replace it, not create a second row — otherwise the grid and the booking gate could disagree about that person's status for that day.

---

## File Structure

- **Create:** `supabase/migrations/016_staff_shift_availability.sql` — schema fix + RLS (from spec, user applies manually in Supabase SQL editor).
- **Create:** `src/lib/supabase/queries/staffShifts.ts` — all reads/writes of `staff_shifts` for both the Front Desk UI and the booking flow.
- **Create:** `src/components/frontdesk/staff/AddStaffBlockModal.tsx` — the "Add Block" form.
- **Modify:** `src/components/frontdesk/staff/StaffShiftGrid.tsx` — full rewrite from a hardcoded hourly bar to a date-scoped on/off status list with remove controls.
- **Modify:** `src/components/frontdesk/staff/StaffScheduleHeader.tsx` — real date nav (prev/next/today) replacing the hardcoded date text; wires the "Add Block" button.
- **Create:** `src/components/frontdesk/staff/StaffScheduleClient.tsx` — client wrapper holding the shared `selectedDate` state, composing the header, grid, and modal.
- **Modify:** `src/app/frontdesk/staff/page.tsx` — swap the header+grid pair for `StaffScheduleClient`.
- **Modify:** `src/components/booking/BookingModal.tsx` — new state/effect (~after line 200), date-grid edit (~941-964), time-slot edit (~968-982), submit-time re-check inside `saveBooking()` (~before line 401).

---

### Task 1: Migration — fix `staff_shifts` and add RLS

**Files:**
- Create: `supabase/migrations/016_staff_shift_availability.sql`

**Interfaces:**
- Produces: a `staff_shifts` table shaped `id (uuid), staff_member_id (uuid, fk -> staff_members.id, on delete cascade), branch_id (uuid), shift_date (date), period (text, check in ('full_day','morning','afternoon'), default 'full_day'), created_at`.

- [ ] **Step 1: Write the migration file**

```sql
-- 016_staff_shift_availability.sql
-- Fix the FK: staff_shifts must reference staff_members, not the dead
-- professionals table. Table has 0 rows, so this is safe.
alter table staff_shifts drop constraint if exists staff_shifts_professional_id_fkey;
alter table staff_shifts rename column professional_id to staff_member_id;
alter table staff_shifts
  add constraint staff_shifts_staff_member_id_fkey
  foreign key (staff_member_id) references staff_members(id) on delete cascade;

-- Replace the old working/break/off status with a period concept.
alter table staff_shifts drop column if exists status;
alter table staff_shifts drop column if exists start_time;
alter table staff_shifts drop column if exists end_time;
alter table staff_shifts add column if not exists period text not null default 'full_day';

do $$ begin
  alter table staff_shifts
    add constraint staff_shifts_period_check
    check (period in ('full_day', 'morning', 'afternoon'));
exception when duplicate_object then null; end $$;

alter table staff_shifts enable row level security;

drop policy if exists "public read staff_shifts" on staff_shifts;
create policy "public read staff_shifts" on staff_shifts for select using (true);

drop policy if exists "staff manage staff_shifts" on staff_shifts;
create policy "staff manage staff_shifts" on staff_shifts for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk'))
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'front_desk'))
  );
```

- [ ] **Step 2: Verify the file was written correctly**

Run: `cat "supabase/migrations/016_staff_shift_availability.sql"` (or open it) and confirm it matches the block above exactly — this file will be run by hand in the Supabase SQL editor, not by any test runner in this repo.

- [ ] **Step 3: Ask the user to apply it**

Tell the user: "Please run `supabase/migrations/016_staff_shift_availability.sql` in the Supabase SQL editor, then let me know." Later tasks' manual verification steps (Tasks 4, 6, 7) require this to be applied first — code tasks in between (2, 3, 5) don't need it to compile.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/016_staff_shift_availability.sql
git commit -m "feat: add staff_shifts migration for shift availability"
```

---

### Task 2: Query helper module — `staffShifts.ts`

**Files:**
- Create: `src/lib/supabase/queries/staffShifts.ts`

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js` (same type used by `frontdeskDashboard.ts`).
- Produces:
  - `type StaffOffPeriod = "full_day" | "morning" | "afternoon"`
  - `type StaffOffRecord = { id: string; staff_member_id: string; branch_id: string; shift_date: string; period: StaffOffPeriod }`
  - `toDateKey(date: Date): string`
  - `getStaffShiftsForDate(supabase, branchId: string, dateKey: string): Promise<StaffOffRecord[]>`
  - `getStaffShiftsForRange(supabase, staffMemberId: string, startKey: string, endKey: string): Promise<StaffOffRecord[]>`
  - `upsertStaffOff(supabase, input: { staffMemberId: string; branchId: string; shiftDate: string; period: StaffOffPeriod }): Promise<{ error: string | null }>`
  - `removeStaffOff(supabase, id: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Write the module**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffOffPeriod = "full_day" | "morning" | "afternoon";

export type StaffOffRecord = {
  id: string;
  staff_member_id: string;
  branch_id: string;
  shift_date: string;
  period: StaffOffPeriod;
};

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}

export async function getStaffShiftsForDate(
  supabase: SupabaseClient,
  branchId: string,
  dateKey: string
): Promise<StaffOffRecord[]> {
  const { data, error } = await supabase
    .from("staff_shifts")
    .select("id, staff_member_id, branch_id, shift_date, period")
    .eq("branch_id", branchId)
    .eq("shift_date", dateKey);

  if (error) {
    console.error("getStaffShiftsForDate failed:", error);
    return [];
  }
  return (data as StaffOffRecord[]) ?? [];
}

export async function getStaffShiftsForRange(
  supabase: SupabaseClient,
  staffMemberId: string,
  startKey: string,
  endKey: string
): Promise<StaffOffRecord[]> {
  const { data, error } = await supabase
    .from("staff_shifts")
    .select("id, staff_member_id, branch_id, shift_date, period")
    .eq("staff_member_id", staffMemberId)
    .gte("shift_date", startKey)
    .lte("shift_date", endKey);

  if (error) {
    console.error("getStaffShiftsForRange failed:", error);
    return [];
  }
  return (data as StaffOffRecord[]) ?? [];
}

export async function upsertStaffOff(
  supabase: SupabaseClient,
  input: { staffMemberId: string; branchId: string; shiftDate: string; period: StaffOffPeriod }
): Promise<{ error: string | null }> {
  const { error: deleteError } = await supabase
    .from("staff_shifts")
    .delete()
    .eq("staff_member_id", input.staffMemberId)
    .eq("shift_date", input.shiftDate);

  if (deleteError) return { error: deleteError.message };

  const { error: insertError } = await supabase.from("staff_shifts").insert({
    staff_member_id: input.staffMemberId,
    branch_id: input.branchId,
    shift_date: input.shiftDate,
    period: input.period,
  });

  if (insertError) return { error: insertError.message };
  return { error: null };
}

export async function removeStaffOff(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("staff_shifts").delete().eq("id", id);
  return { error: error?.message ?? null };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `src/lib/supabase/queries/staffShifts.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries/staffShifts.ts
git commit -m "feat: add staffShifts query helper"
```

---

### Task 3: Add Block modal

**Files:**
- Create: `src/components/frontdesk/staff/AddStaffBlockModal.tsx`

**Interfaces:**
- Consumes: `useStaffProfile()` from `@/lib/hooks/useStaffProfile` (for `branchId`); `createClient()` from `@/lib/supabase/client`; `toDateKey`, `upsertStaffOff`, `StaffOffPeriod` from `@/lib/supabase/queries/staffShifts`.
- Produces: `AddStaffBlockModal({ defaultDate: Date; onClose: () => void; onSaved: () => void })` — a default export.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey, upsertStaffOff, type StaffOffPeriod } from "@/lib/supabase/queries/staffShifts";

type StaffRow = { id: string; full_name: string; department: string | null };

const PERIOD_OPTIONS: { value: StaffOffPeriod; label: string }[] = [
  { value: "full_day", label: "Full Day" },
  { value: "morning", label: "Morning (before 1:00 PM)" },
  { value: "afternoon", label: "Afternoon (1:00 PM onward)" },
];

export default function AddStaffBlockModal({
  defaultDate,
  onClose,
  onSaved,
}: {
  defaultDate: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useStaffProfile();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [staffMemberId, setStaffMemberId] = useState("");
  const [shiftDate, setShiftDate] = useState(toDateKey(defaultDate));
  const [period, setPeriod] = useState<StaffOffPeriod>("full_day");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.branchId) return;
    const supabase = createClient();
    supabase
      .from("staff_members")
      .select("id, full_name, department")
      .eq("branch_id", profile.branchId)
      .order("full_name")
      .then(({ data }) => {
        const rows = (data as StaffRow[]) ?? [];
        setStaff(rows);
        if (rows.length > 0) setStaffMemberId((prev) => prev || rows[0].id);
      });
  }, [profile?.branchId]);

  async function submit() {
    if (!profile?.branchId || !staffMemberId || !shiftDate) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: saveError } = await upsertStaffOff(supabase, {
      staffMemberId,
      branchId: profile.branchId,
      shiftDate,
      period,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Add Block</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-ink/50">Staff member</label>
            <select
              value={staffMemberId}
              onChange={(e) => setStaffMemberId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {s.department ? ` — ${s.department}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-ink/50">Date</label>
            <input
              type="date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink/50">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as StaffOffPeriod)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={saving || !staffMemberId || !shiftDate}
            className="w-full rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Block"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `AddStaffBlockModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/frontdesk/staff/AddStaffBlockModal.tsx
git commit -m "feat: add AddStaffBlockModal for marking staff off"
```

---

### Task 4: Rewrite `StaffShiftGrid.tsx`

**Files:**
- Modify: `src/components/frontdesk/staff/StaffShiftGrid.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useStaffProfile()`; `createClient()`; `getStaffShiftsForDate`, `toDateKey`, `type StaffOffRecord`, `removeStaffOff` from `@/lib/supabase/queries/staffShifts`.
- Produces: `StaffShiftGrid({ selectedDate: Date; refreshKey: number; onChanged: () => void })` — default export, replacing the old zero-prop version.

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { getStaffShiftsForDate, removeStaffOff, toDateKey, type StaffOffRecord } from "@/lib/supabase/queries/staffShifts";

type StaffRow = { id: string; full_name: string; department: string | null };

const PERIOD_LABEL: Record<StaffOffRecord["period"], string> = {
  full_day: "Off (Full Day)",
  morning: "Off (Morning)",
  afternoon: "Off (Afternoon)",
};

export default function StaffShiftGrid({
  selectedDate,
  refreshKey,
  onChanged,
}: {
  selectedDate: Date;
  refreshKey: number;
  onChanged: () => void;
}) {
  const { profile } = useStaffProfile();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [offRecords, setOffRecords] = useState<StaffOffRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const dateKey = toDateKey(selectedDate);
    Promise.all([
      supabase
        .from("staff_members")
        .select("id, full_name, department")
        .eq("branch_id", profile.branchId)
        .order("full_name"),
      getStaffShiftsForDate(supabase, profile.branchId, dateKey),
    ]).then(([staffRes, records]) => {
      setStaff((staffRes.data as StaffRow[]) ?? []);
      setOffRecords(records);
      setLoading(false);
    });
  }, [profile?.branchId, selectedDate, refreshKey]);

  async function handleRemove(id: string) {
    const supabase = createClient();
    await removeStaffOff(supabase, id);
    onChanged();
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm text-ink/50">Loading staff schedule...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      {staff.length === 0 ? (
        <p className="text-sm text-ink/50">No staff assigned to this branch yet.</p>
      ) : (
        <div className="divide-y divide-ink/5">
          {staff.map((member) => {
            const offRecord = offRecords.find((r) => r.staff_member_id === member.id);
            return (
              <div key={member.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-ink">{member.full_name}</p>
                  <p className="text-xs text-ink/50">{member.department ?? ""}</p>
                </div>
                {offRecord ? (
                  <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                    {PERIOD_LABEL[offRecord.period]}
                    <button
                      onClick={() => handleRemove(offRecord.id)}
                      aria-label={`Remove off block for ${member.full_name}`}
                      className="hover:text-red-800"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                    On Duty
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors referencing the old zero-prop `<StaffShiftGrid />` call in `page.tsx` (expected — fixed in Task 6) and no other errors from this file itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/frontdesk/staff/StaffShiftGrid.tsx
git commit -m "feat: replace hardcoded shift bar with real date-scoped staff status"
```

---

### Task 5: Wire `StaffScheduleHeader.tsx` for date nav and Add Block

**Files:**
- Modify: `src/components/frontdesk/staff/StaffScheduleHeader.tsx` (full rewrite)

**Interfaces:**
- Produces: `StaffScheduleHeader({ date: Date; onPrevDay: () => void; onNextDay: () => void; onToday: () => void; onAddBlock: () => void })` — default export, replacing the old zero-prop version.

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";

import { ChevronLeft, ChevronRight, ChevronsRight, LayoutList, Plus, Upload } from "lucide-react";

export default function StaffScheduleHeader({
  date,
  onPrevDay,
  onNextDay,
  onToday,
  onAddBlock,
}: {
  date: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onAddBlock: () => void;
}) {
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Staff Schedule</h1>
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={onPrevDay}
              aria-label="Previous day"
              className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm text-ink/50">{label}</p>
            <button
              onClick={onNextDay}
              aria-label="Next day"
              className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={onToday}
              aria-label="Jump to today"
              title="Jump to today"
              className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-coral-dark"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-coral">
            <LayoutList className="h-3.5 w-3.5" /> High Density View
          </button>
          <button className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-coral">
            Filter Staff
          </button>
          <button
            onClick={onAddBlock}
            className="flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink/60 hover:border-coral"
          >
            <Plus className="h-3.5 w-3.5" /> Add Block
          </button>
          <button className="flex items-center gap-1.5 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white">
            <Upload className="h-3.5 w-3.5" /> Publish to GlowSync
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors referencing the old zero-prop `<StaffScheduleHeader />` call in `page.tsx` (expected — fixed in Task 6) and no other errors from this file itself.

- [ ] **Step 3: Commit**

```bash
git add src/components/frontdesk/staff/StaffScheduleHeader.tsx
git commit -m "feat: add real date navigation and Add Block wiring to StaffScheduleHeader"
```

---

### Task 6: `StaffScheduleClient.tsx` wrapper and `page.tsx` wiring

**Files:**
- Create: `src/components/frontdesk/staff/StaffScheduleClient.tsx`
- Modify: `src/app/frontdesk/staff/page.tsx`

**Interfaces:**
- Consumes: `StaffScheduleHeader` (Task 5), `StaffShiftGrid` (Task 4), `AddStaffBlockModal` (Task 3).
- Produces: `StaffScheduleClient()` — default export, no props, self-contained date-nav + modal state.

- [ ] **Step 1: Write `StaffScheduleClient.tsx`**

```tsx
"use client";

import { useState } from "react";
import StaffScheduleHeader from "./StaffScheduleHeader";
import StaffShiftGrid from "./StaffShiftGrid";
import AddStaffBlockModal from "./AddStaffBlockModal";

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function StaffScheduleClient() {
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function shiftDay(delta: number) {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }

  return (
    <>
      <StaffScheduleHeader
        date={selectedDate}
        onPrevDay={() => shiftDay(-1)}
        onNextDay={() => shiftDay(1)}
        onToday={() => setSelectedDate(startOfDay(new Date()))}
        onAddBlock={() => setShowAddBlock(true)}
      />
      <StaffShiftGrid
        selectedDate={selectedDate}
        refreshKey={refreshKey}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
      {showAddBlock && (
        <AddStaffBlockModal
          defaultDate={selectedDate}
          onClose={() => setShowAddBlock(false)}
          onSaved={() => {
            setShowAddBlock(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Update `page.tsx`**

Replace the full contents of `src/app/frontdesk/staff/page.tsx`:

```tsx
import StaffScheduleClient from "@/components/frontdesk/staff/StaffScheduleClient";
import StaffCapacityStats from "@/components/frontdesk/staff/StaffCapacityStats";
import QuickActions from "@/components/frontdesk/staff/QuickActions";

export default function FrontDeskStaffPage() {
  return (
    <div className="space-y-6">
      <StaffScheduleClient />
      <StaffCapacityStats />
      <QuickActions />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in `src/app/frontdesk/staff/` or `src/components/frontdesk/staff/`.

- [ ] **Step 4: Manual verification via the `run` skill**

1. Log in as a front_desk account, go to Staff Schedule.
2. Confirm the header shows today's real date and every staff row shows "On Duty".
3. Click "Add Block", pick a staff member, tomorrow's date, "Full Day", save. Confirm the modal closes and (after clicking next-day) that staff member shows "Off (Full Day)".
4. Click the × on that off badge. Confirm it reverts to "On Duty" without a page reload.
5. Add a block for a *different* staff member on the *same* date with "Morning". Confirm both staff members' rows show correct, distinct statuses (Review Focus: no cross-contamination between rows).
6. Add a "Morning" block for a staff member who already has a "Full Day" block on the same date. Confirm the row shows only "Off (Morning)" afterward — one row, not two (Review Focus: replace not duplicate).

- [ ] **Step 5: Commit**

```bash
git add src/components/frontdesk/staff/StaffScheduleClient.tsx src/app/frontdesk/staff/page.tsx
git commit -m "feat: wire Staff Schedule page to shared date-nav state"
```

---

### Task 7: `BookingModal.tsx` — gate the public booking flow

**Files:**
- Modify: `src/components/booking/BookingModal.tsx`

**Interfaces:**
- Consumes: `getStaffShiftsForRange`, `toDateKey`, `type StaffOffRecord` from `@/lib/supabase/queries/staffShifts`; existing `professionalId`, `calendarMonth`, `selectedDate` (the memoized `Date | null` at line 340), `branchUuid`, `to24Hour`, `startOfMonth`, `buildMonthGrid`, `isBeforeToday`, `timeSlots`, `BRANCH_TIME_SLOTS` — all already defined in this file.
- Produces: no new exports; behavior change only.

- [ ] **Step 1: Add the import**

In the import block near the top of the file (after the `createClient` import, line 12), add:

```ts
import { getStaffShiftsForRange, toDateKey, type StaffOffRecord } from "@/lib/supabase/queries/staffShifts";
```

- [ ] **Step 2: Add helper functions**

Immediately after the existing `endTime` function (after line 163, before `export default function BookingModal`), add:

```ts
function isFullDayOff(date: Date, offDays: StaffOffRecord[]) {
  const key = toDateKey(date);
  return offDays.some((r) => r.shift_date === key && r.period === "full_day");
}

function periodOffForDate(date: Date, offDays: StaffOffRecord[]): "morning" | "afternoon" | null {
  const key = toDateKey(date);
  const record = offDays.find(
    (r) => r.shift_date === key && (r.period === "morning" || r.period === "afternoon")
  );
  return record ? (record.period as "morning" | "afternoon") : null;
}

function isSlotAfterCutoff(time: string) {
  const hour24 = Number(to24Hour(time).split(":")[0]);
  return hour24 >= 13;
}
```

- [ ] **Step 3: Add state and the fetch effect**

Add new state right after `const [showSelectedPanel, setShowSelectedPanel] = useState(false);` (line 200):

```ts
const [staffOffDays, setStaffOffDays] = useState<StaffOffRecord[]>([]);
```

Add a new effect right after the existing staff-members effect (after line 329, before the OTP effect):

```ts
useEffect(() => {
  if (!professionalId || professionalId === "any") {
    setStaffOffDays([]);
    return;
  }
  const supabase = createClient();
  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
  getStaffShiftsForRange(
    supabase,
    professionalId,
    toDateKey(monthStart),
    toDateKey(monthEnd)
  ).then(setStaffOffDays);
}, [professionalId, calendarMonth]);
```

- [ ] **Step 4: Edit the date grid**

Replace the date-grid map (originally lines 941-964):

```tsx
{buildMonthGrid(calendarMonth).map((day, i) => {
  const cellDate = day
    ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
    : null;
  const isPast = cellDate ? isBeforeToday(cellDate) : false;
  const isStaffOff = cellDate ? isFullDayOff(cellDate, staffOffDays) : false;
  const isDisabled = !day || isPast || isStaffOff;
  return (
    <button
      key={i}
      disabled={isDisabled}
      onClick={() => day && !isDisabled && setSelectedDay(day)}
      className={`aspect-square rounded-full ${
        !day
          ? ""
          : isPast || isStaffOff
            ? "text-ink/20 cursor-not-allowed"
            : day === selectedDay
              ? "bg-coral text-white"
              : "hover:bg-blush"
      }`}
    >
      {day ?? ""}
    </button>
  );
})}
```

- [ ] **Step 5: Edit the time-slot list**

Replace the time-slot block (originally lines 968-982):

```tsx
<div className="space-y-2 overflow-y-auto">
  {(() => {
    const allSlots = BRANCH_TIME_SLOTS[branchId ?? ""] ?? timeSlots;
    const offPeriod = selectedDate ? periodOffForDate(selectedDate, staffOffDays) : null;
    const availableSlots = allSlots.filter((time) => {
      if (!offPeriod) return true;
      const afterCutoff = isSlotAfterCutoff(time);
      return offPeriod === "morning" ? afterCutoff : !afterCutoff;
    });

    if (availableSlots.length === 0) {
      return (
        <p className="text-sm text-ink/50">
          No available times for this therapist on this date.
        </p>
      );
    }

    return availableSlots.map((time) => (
      <button
        key={time}
        onClick={() => setSelectedTime(time)}
        className={`block w-full rounded-lg border px-3 py-2.5 text-base ${
          selectedTime === time
            ? "border-coral bg-blush text-coral-dark"
            : "border-ink/10 text-ink/70 hover:border-coral"
        }`}
      >
        {time}
      </button>
    ));
  })()}
</div>
```

- [ ] **Step 6: Add the submit-time race check**

In `saveBooking`, right after the existing check `if (!branchRow || !selectedDate || !selectedTime) { ... }` (originally lines 390-394), add:

```ts
if (professionalId && professionalId !== "any") {
  const dateKey = toDateKey(selectedDate);
  const { data: conflictRows } = await supabase
    .from("staff_shifts")
    .select("period")
    .eq("staff_member_id", professionalId)
    .eq("shift_date", dateKey);
  const conflicts = (conflictRows as { period: StaffOffRecord["period"] }[]) ?? [];
  const blockingConflict = conflicts.some(
    (r) =>
      r.period === "full_day" ||
      (r.period === "morning" && !isSlotAfterCutoff(selectedTime)) ||
      (r.period === "afternoon" && isSlotAfterCutoff(selectedTime))
  );
  if (blockingConflict) {
    setSaveError("This professional just became unavailable for that date/time. Please pick another slot.");
    setSaving(false);
    return false;
  }
}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `BookingModal.tsx`.

- [ ] **Step 8: Manual verification via the `run` skill**

1. As front desk, mark a specific staff member off "Full Day" for tomorrow (reuse the block from Task 6 if still present, or add a fresh one).
2. As a customer, open the booking modal, pick that branch and that same professional by name (not "Any Professional"). Confirm tomorrow's date is disabled in the calendar and other upcoming dates are not.
3. Mark a *different* staff member off "Morning" for today. Select that professional; confirm the 1:00 PM slot is still selectable, slots before it are not, and slots after it are (Review Focus: exact boundary).
4. With that same professional still selected, go back and re-select "Any Professional" instead. Confirm every date and time slot is immediately selectable again (Review Focus: switching back to "any" clears state).
5. Select a professional with zero available slots on a given date (mark them off "Full Day" isn't enough since that disables the date itself — instead mark "Morning" and "Afternoon" would conflict since only one record is allowed; instead pick a branch whose hours are entirely within one period, or simply verify the empty-state message renders when `availableSlots.length === 0` by temporarily narrowing `BRANCH_TIME_SLOTS` during this check only, then revert). Confirm the inline "No available times for this therapist on this date." message appears instead of a blank list.
6. Race check: open the booking modal and get to the time step for a specific professional on a specific date with an open slot. In a second browser tab as front desk, mark that professional off "Full Day" for that date. Back in the first tab, complete the booking. Confirm it fails with the "just became unavailable" error instead of silently succeeding.
7. Confirm "Any Professional" bookings are unaffected throughout — no dates or times are ever disabled for it.

- [ ] **Step 9: Commit**

```bash
git add src/components/booking/BookingModal.tsx
git commit -m "feat: gate booking flow on staff shift availability"
```
