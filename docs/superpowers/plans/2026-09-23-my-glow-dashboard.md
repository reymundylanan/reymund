# My Glow Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/my-glow` client dashboard (upcoming booking, service history, reviews, loyalty rewards, an inline AI assistant, and a Glow Journey teaser), reachable from a new "My Glow" nav link that only appears for logged-in customers.

**Architecture:** A new server-component page (`src/app/my-glow/page.tsx`) auth-guards and fetches all dashboard data server-side via Supabase, then renders focused client/server section components under `src/components/my-glow/`. A new `reviews.professional_id` column (migration) lets one `reviews` table serve both therapist and spa reviews. Loyalty tiers are pure display logic over the existing `profiles.loyalty_points` column. The existing Gemini-backed assistant is made session-aware by injecting the caller's own booking/points data into its system prompt server-side, and its chat logic is extracted into a shared hook so both the floating widget and the new inline dashboard panel use one implementation.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, Supabase (`@supabase/ssr`), Gemini API (`gemini-2.5-flash-lite`), lucide-react icons.

**Spec:** [docs/superpowers/specs/2026-09-23-my-glow-dashboard-design.md](../specs/2026-09-23-my-glow-dashboard-design.md)

## Global Constraints

- Tier ladder is fixed and hardcoded: Bronze 0, Silver 1000, Gold 2000, Platinum 5000 Glow Points.
- No per-service/per-professional images exist in the DB — all thumbnails use the existing static asset `/images/services/spaservice.jpg`.
- `/my-glow` redirects to `/` for anyone who isn't an authenticated `profiles.role === "customer"`.
- "Glow Journey" ships as a banner + a static "coming soon" page only — no tracking logic.
- No automated test framework exists in this repo; every task is verified manually (dev server + curl/browser, or `npx tsc --noEmit` for pure logic/types).
- The reviews-table migration (`012_professional_reviews.sql`) must be applied manually by the user in the Supabase SQL editor — this session has no DB admin credentials to run it directly. Flag this clearly when Task 1 is reached.
- Assistant context data (booking, points, tier) is always looked up server-side from the authenticated session — never trusted from client-sent payload fields.

## Review Focus

- A guest or a logged-in non-customer (front_desk/admin/specialist) navigates directly to `/my-glow` by URL — must redirect cleanly, never render dashboard data or crash.
- A brand-new customer with zero appointments and zero reviews ever loads `/my-glow` — every section (booking, history, reviews, rewards) must show its empty state, not throw on a null join.
- `profiles.loyalty_points` is exactly on a tier boundary (0, 1000, 2000, 5000) or above the top tier (e.g. 7500) — tier name and progress bar must be correct with no negative "points to next" and no divide-by-zero.
- A client has already reviewed the only professional they've completed a service with — the "Review Your Therapist" card must not reappear for that professional.
- A client with no upcoming booking asks the inline assistant "check my bookings" — the reply must truthfully say they have none, not hallucinate one.

---

### Task 1: Reviews schema migration

**Files:**
- Create: `supabase/migrations/012_professional_reviews.sql`

**Interfaces:**
- Produces: `reviews.professional_id` (nullable uuid FK to `professionals.id`), and a `reviews_target_check` constraint requiring `branch_id is not null or professional_id is not null`. Later tasks' review queries depend on this column existing.

- [ ] **Step 1: Write the migration**

```sql
-- 012_professional_reviews.sql
-- Adds therapist-level reviews alongside the existing branch-level reviews.

alter table reviews
  add column if not exists professional_id uuid references professionals(id) on delete cascade;

alter table reviews
  alter column branch_id drop not null;

do $$ begin
  alter table reviews
    add constraint reviews_target_check
    check (branch_id is not null or professional_id is not null);
exception when duplicate_object then null; end $$;
```

- [ ] **Step 2: Apply it manually and verify**

This session cannot run DDL against the live database. Ask the user to paste the contents of `supabase/migrations/012_professional_reviews.sql` into the Supabase SQL editor (`https://supabase.com/dashboard/project/_/sql/new`) and run it. Confirm success by asking them to run:

```sql
select column_name from information_schema.columns
where table_name = 'reviews' and column_name = 'professional_id';
```

Expected: one row returned. Do not proceed to tasks that write to `reviews` (Task 10) until this is confirmed applied — earlier tasks (2–9, 11–13 minus review submission) do not depend on it and can proceed in parallel.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/012_professional_reviews.sql
git commit -m "feat: add professional_id column to reviews for therapist reviews"
```

---

### Task 2: Glow tier logic

**Files:**
- Create: `src/lib/myGlowTiers.ts`

**Interfaces:**
- Produces: `getTierProgress(points: number): TierProgress` where
  `TierProgress = { tier: TierName; points: number; nextTier: TierName | null; pointsToNext: number | null; progressPercent: number }`
  and `TierName = "Bronze" | "Silver" | "Gold" | "Platinum"`. Used by Task 8 (`GlowRewardsCard`) and Task 12 (assistant context).

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/myGlowTiers.ts
export type TierName = "Bronze" | "Silver" | "Gold" | "Platinum";

export type TierProgress = {
  tier: TierName;
  points: number;
  nextTier: TierName | null;
  pointsToNext: number | null;
  progressPercent: number;
};

const TIERS: { name: TierName; threshold: number }[] = [
  { name: "Bronze", threshold: 0 },
  { name: "Silver", threshold: 1000 },
  { name: "Gold", threshold: 2000 },
  { name: "Platinum", threshold: 5000 },
];

export function getTierProgress(points: number): TierProgress {
  const safePoints = Math.max(0, points);

  let current = TIERS[0];
  for (const t of TIERS) {
    if (safePoints >= t.threshold) current = t;
  }
  const currentIndex = TIERS.findIndex((t) => t.name === current.name);
  const next = TIERS[currentIndex + 1] ?? null;

  if (!next) {
    return {
      tier: current.name,
      points: safePoints,
      nextTier: null,
      pointsToNext: null,
      progressPercent: 100,
    };
  }

  const band = next.threshold - current.threshold;
  const progressInBand = safePoints - current.threshold;
  const progressPercent = Math.min(100, Math.round((progressInBand / band) * 100));

  return {
    tier: current.name,
    points: safePoints,
    nextTier: next.name,
    pointsToNext: next.threshold - safePoints,
    progressPercent,
  };
}
```

- [ ] **Step 2: Verify with boundary cases**

Node 24 runs TypeScript modules directly via `import`. Create a throwaway script:

```bash
cat > /tmp/verify-tiers.mjs <<'EOF'
import { getTierProgress } from "/c/Users/Arnel Almenio/reymund/src/lib/myGlowTiers.ts";
for (const p of [-50, 0, 1240, 1000, 2000, 5000, 7500]) {
  console.log(p, getTierProgress(p));
}
EOF
node /tmp/verify-tiers.mjs
rm /tmp/verify-tiers.mjs
```

Expected: `1240` gives `tier: "Silver", nextTier: "Gold", pointsToNext: 760, progressPercent: 24` (matches the mockup's "1,240 pts / 760 pts to Gold"). `-50` and `0` both give `tier: "Bronze"`. `5000` and `7500` both give `tier: "Platinum", nextTier: null, pointsToNext: null, progressPercent: 100`. `1000` and `2000` land exactly on `Silver` and `Gold` respectively with `progressPercent: 0`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/myGlowTiers.ts
git commit -m "feat: add Glow Rewards tier calculation"
```

---

### Task 3: My Glow data query helpers

**Files:**
- Create: `src/lib/supabase/queries/myGlow.ts`

**Interfaces:**
- Consumes: a `SupabaseClient` instance (from either `@/lib/supabase/client` or `@/lib/supabase/server`), the caller's `clientId: string`.
- Produces:
  - `type UpcomingAppointment = { id: string; scheduledDate: string; startTime: string; durationMinutes: number; serviceName: string | null; professionalName: string | null; branchName: string | null }`
  - `type RecentAppointment = { id: string; scheduledDate: string; startTime: string; status: string; serviceName: string | null; professionalName: string | null }`
  - `type ReviewableProfessional = { professionalId: string; professionalName: string }`
  - `type MyReview = { id: string; rating: number; text: string | null; createdAt: string; targetType: "professional" | "branch"; targetName: string }`
  - `type DefaultBranch = { id: string; name: string } | null`
  - `getUpcomingAppointment(supabase, clientId): Promise<UpcomingAppointment | null>`
  - `getRecentAppointments(supabase, clientId, limit?): Promise<RecentAppointment[]>`
  - `getReviewableProfessionals(supabase, clientId): Promise<ReviewableProfessional[]>`
  - `getMyReviews(supabase, clientId): Promise<MyReview[]>`
  - `getDefaultBranch(supabase, clientId): Promise<DefaultBranch>`
  - `submitReview(supabase, params: { clientId: string; professionalId?: string; branchId?: string; rating: number; text: string }): Promise<{ error: string | null }>`
  These are consumed by Task 4 (page shell), Task 6–10 (section components), and Task 12 (assistant route).

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/supabase/queries/myGlow.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type UpcomingAppointment = {
  id: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  serviceName: string | null;
  professionalName: string | null;
  branchName: string | null;
};

export type RecentAppointment = {
  id: string;
  scheduledDate: string;
  startTime: string;
  status: string;
  serviceName: string | null;
  professionalName: string | null;
};

export type ReviewableProfessional = {
  professionalId: string;
  professionalName: string;
};

export type MyReview = {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  targetType: "professional" | "branch";
  targetName: string;
};

export type DefaultBranch = { id: string; name: string } | null;

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type RawAppointmentRow = {
  id: string;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  service: Rel<{ name: string }>;
  professional: Rel<{ name: string }>;
  branch: Rel<{ name: string }>;
};

export async function getUpcomingAppointment(
  supabase: SupabaseClient,
  clientId: string
): Promise<UpcomingAppointment | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_date, start_time, duration_minutes, status, service:services(name), professional:professionals(name), branch:branches(name)"
    )
    .eq("client_id", clientId)
    .in("status", ["confirmed", "pending"])
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as RawAppointmentRow;
  return {
    id: row.id,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    serviceName: one(row.service)?.name ?? null,
    professionalName: one(row.professional)?.name ?? null,
    branchName: one(row.branch)?.name ?? null,
  };
}

export async function getRecentAppointments(
  supabase: SupabaseClient,
  clientId: string,
  limit = 10
): Promise<RecentAppointment[]> {
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_date, start_time, status, service:services(name), professional:professionals(name)"
    )
    .eq("client_id", clientId)
    .order("scheduled_date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(limit);

  return ((data as unknown as RawAppointmentRow[]) ?? []).map((row) => ({
    id: row.id,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    status: row.status,
    serviceName: one(row.service)?.name ?? null,
    professionalName: one(row.professional)?.name ?? null,
  }));
}

export async function getReviewableProfessionals(
  supabase: SupabaseClient,
  clientId: string
): Promise<ReviewableProfessional[]> {
  const { data: completed } = await supabase
    .from("appointments")
    .select("professional_id, professional:professionals(name)")
    .eq("client_id", clientId)
    .eq("status", "completed")
    .not("professional_id", "is", null);

  const { data: reviewed } = await supabase
    .from("reviews")
    .select("professional_id")
    .eq("client_id", clientId)
    .not("professional_id", "is", null);

  const reviewedIds = new Set(
    (reviewed ?? []).map((r) => r.professional_id as string)
  );
  const seen = new Set<string>();
  const result: ReviewableProfessional[] = [];

  type CompletedRow = {
    professional_id: string | null;
    professional: Rel<{ name: string }>;
  };

  for (const row of (completed as unknown as CompletedRow[]) ?? []) {
    if (!row.professional_id) continue;
    if (reviewedIds.has(row.professional_id) || seen.has(row.professional_id)) continue;
    seen.add(row.professional_id);
    result.push({
      professionalId: row.professional_id,
      professionalName: one(row.professional)?.name ?? "Your therapist",
    });
  }

  return result;
}

export async function getMyReviews(
  supabase: SupabaseClient,
  clientId: string
): Promise<MyReview[]> {
  const { data } = await supabase
    .from("reviews")
    .select(
      "id, rating, text, created_at, professional_id, branch_id, professional:professionals(name), branch:branches(name)"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  type ReviewRow = {
    id: string;
    rating: number;
    text: string | null;
    created_at: string;
    professional_id: string | null;
    branch_id: string | null;
    professional: Rel<{ name: string }>;
    branch: Rel<{ name: string }>;
  };

  return ((data as unknown as ReviewRow[]) ?? []).map((row) => {
    const isProfessional = !!row.professional_id;
    return {
      id: row.id,
      rating: row.rating,
      text: row.text,
      createdAt: row.created_at,
      targetType: isProfessional ? "professional" : "branch",
      targetName: isProfessional
        ? one(row.professional)?.name ?? "Therapist"
        : one(row.branch)?.name ?? "Blush Spa",
    };
  });
}

export async function getDefaultBranch(
  supabase: SupabaseClient,
  clientId: string
): Promise<DefaultBranch> {
  const { data } = await supabase
    .from("appointments")
    .select("branch:branches(id, name)")
    .eq("client_id", clientId)
    .not("branch_id", "is", null)
    .order("scheduled_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const branch = one(
    (data as { branch: Rel<{ id: string; name: string }> } | null)?.branch ?? null
  );
  return branch ? { id: branch.id, name: branch.name } : null;
}

export async function submitReview(
  supabase: SupabaseClient,
  params: {
    clientId: string;
    professionalId?: string;
    branchId?: string;
    rating: number;
    text: string;
  }
): Promise<{ error: string | null }> {
  if (!params.professionalId && !params.branchId) {
    return { error: "Review must target a therapist or the spa." };
  }
  const { error } = await supabase.from("reviews").insert({
    client_id: params.clientId,
    professional_id: params.professionalId ?? null,
    branch_id: params.branchId ?? null,
    rating: params.rating,
    text: params.text,
  });
  return { error: error?.message ?? null };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors referencing `src/lib/supabase/queries/myGlow.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries/myGlow.ts
git commit -m "feat: add My Glow data query helpers"
```

---

### Task 4: My Glow page shell with auth guard

**Files:**
- Create: `src/app/my-glow/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; all functions from Task 3's `@/lib/supabase/queries/myGlow`.
- Produces: the `/my-glow` route. Later tasks (6–10) replace the temporary `<pre>` dump inside this file with real section components; Task 13 finalizes the layout.

- [ ] **Step 1: Write the page shell**

```tsx
// src/app/my-glow/page.tsx
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import {
  getUpcomingAppointment,
  getRecentAppointments,
  getReviewableProfessionals,
  getMyReviews,
  getDefaultBranch,
} from "@/lib/supabase/queries/myGlow";

export default async function MyGlowPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, loyalty_points")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.role !== "customer") redirect("/");

  const [upcoming, recent, reviewable, myReviews, defaultBranch] =
    await Promise.all([
      getUpcomingAppointment(supabase, auth.user.id),
      getRecentAppointments(supabase, auth.user.id),
      getReviewableProfessionals(supabase, auth.user.id),
      getMyReviews(supabase, auth.user.id),
      getDefaultBranch(supabase, auth.user.id),
    ]);

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-6 py-10">
        <pre className="mx-auto max-w-4xl overflow-auto rounded-2xl bg-white p-6 text-xs">
          {JSON.stringify(
            { profile, upcoming, recent, reviewable, myReviews, defaultBranch },
            null,
            2
          )}
        </pre>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Verify the auth guard and data fetch**

Use the `run` skill to launch the dev server (`npm run dev`, already configured in this project).

- Logged out: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/my-glow` — expected: a redirect (307) toward `/`.
- Logged in as the seeded customer account (in a browser, since auth uses cookies): visit `http://localhost:3000/my-glow` — expected: a JSON dump of `profile`/`upcoming`/`recent`/`reviewable`/`myReviews`/`defaultBranch` reflecting that account's real Supabase data, no server error.
- Logged in as a non-customer role (front_desk/admin/specialist), if a seeded account exists: visiting `/my-glow` redirects to `/` — this is Review Focus item 1; note in your report if no non-customer test account is available to check this against.

- [ ] **Step 3: Commit**

```bash
git add src/app/my-glow/page.tsx
git commit -m "feat: add /my-glow page shell with auth guard and data fetch"
```

---

### Task 5: Header — add "My Glow" nav link

**Files:**
- Modify: `src/components/Header.tsx:13-18` (the `navLinks` constant)

**Interfaces:**
- Consumes: `user` from the existing `useCurrentUser()` call already present in this file (`user?.role`).
- Produces: nothing consumed by other tasks — purely a nav change.

- [ ] **Step 1: Make the link list conditional on customer role**

Replace:

```ts
const navLinks = [
  { label: "Services", href: "/services" },
  { label: "Branches", href: "/branches" },
  { label: "Teams", href: "/#team" },
  { label: "About Us", href: "/about" },
];
```

with:

```ts
const baseNavLinks = [
  { label: "Services", href: "/services" },
  { label: "Branches", href: "/branches" },
  { label: "Teams", href: "/#team" },
  { label: "About Us", href: "/about" },
];
```

Then, inside the `Header()` component body, immediately after the existing `const { user } = useCurrentUser();` line, add:

```ts
  const navLinks =
    user?.role === "customer"
      ? [...baseNavLinks, { label: "My Glow", href: "/my-glow" }]
      : baseNavLinks;
```

The existing `{navLinks.map((link) => ...)}` JSX below is unchanged — it now reads the component-scoped `navLinks` instead of the module-scoped one.

- [ ] **Step 2: Verify in the browser**

With the dev server running: as a guest, the nav shows Services/Branches/Teams/About Us only. Logged in as a customer, "My Glow" appears after "About Us" and links to `/my-glow`. Logged in as a non-customer role, "My Glow" does not appear.

- [ ] **Step 3: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat: show My Glow nav link for logged-in customers"
```

---

### Task 6: Upcoming Booking card

**Files:**
- Create: `src/components/my-glow/UpcomingBookingCard.tsx`
- Modify: `src/app/my-glow/page.tsx` (wire it in)

**Interfaces:**
- Consumes: `UpcomingAppointment | null` from Task 3.
- Produces: `UpcomingBookingCard` default export, props `{ appointment: UpcomingAppointment | null }`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/my-glow/UpcomingBookingCard.tsx
import Image from "next/image";
import Link from "next/link";
import type { UpcomingAppointment } from "@/lib/supabase/queries/myGlow";

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

function daysLeft(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
}

export default function UpcomingBookingCard({
  appointment,
}: {
  appointment: UpcomingAppointment | null;
}) {
  if (!appointment) {
    return (
      <div className="rounded-3xl border border-rose/60 bg-white p-5">
        <h3 className="text-lg font-semibold text-ink">My Upcoming Booking</h3>
        <p className="mt-4 text-sm text-ink/60">No upcoming bookings yet.</p>
        <Link
          href="/services"
          className="mt-3 inline-block rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
        >
          Book Now
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-rose/60 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">My Upcoming Booking</h3>
        <Link href="#services" className="text-sm font-medium text-coral-dark hover:underline">
          View All
        </Link>
      </div>

      <div className="mt-4 flex gap-4">
        <Image
          src="/images/services/spaservice.jpg"
          alt={appointment.serviceName ?? "Service"}
          width={96}
          height={96}
          className="h-24 w-24 shrink-0 rounded-2xl object-cover"
        />
        <div className="flex-1">
          <p className="text-base font-semibold text-ink">
            {appointment.serviceName ?? "Appointment"}
          </p>
          {appointment.professionalName && (
            <p className="text-sm text-ink/60">with {appointment.professionalName}</p>
          )}
          <p className="mt-1 text-sm text-ink/60">
            {new Date(appointment.scheduledDate).toLocaleDateString()} &bull;{" "}
            {formatTime(appointment.startTime)}
          </p>
          {appointment.branchName && (
            <p className="text-sm text-ink/60">{appointment.branchName}</p>
          )}
          <p className="text-sm text-ink/60">{appointment.durationMinutes} mins</p>
        </div>
        <div className="shrink-0 rounded-2xl bg-blush px-4 py-3 text-center">
          <p className="text-2xl font-bold text-coral-dark">
            {daysLeft(appointment.scheduledDate)}
          </p>
          <p className="text-xs text-ink/60">Days left</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `src/app/my-glow/page.tsx`, add the import:

```ts
import UpcomingBookingCard from "@/components/my-glow/UpcomingBookingCard";
```

Replace the `<pre>...</pre>` block's content so `<UpcomingBookingCard appointment={upcoming} />` renders above it (keep the `<pre>` for the remaining not-yet-wired data for now):

```tsx
      <main className="flex-1 bg-blush/30 px-6 py-10">
        <div className="mx-auto max-w-4xl space-y-6">
          <UpcomingBookingCard appointment={upcoming} />
          <pre className="overflow-auto rounded-2xl bg-white p-6 text-xs">
            {JSON.stringify(
              { profile, recent, reviewable, myReviews, defaultBranch },
              null,
              2
            )}
          </pre>
        </div>
      </main>
```

- [ ] **Step 3: Verify in the browser**

Logged in as the seeded customer with an upcoming appointment: card shows service, therapist, date/time, branch, and a correct "days left" count. Log in as (or temporarily point at) an account/state with no upcoming appointment: the empty state with "Book Now" renders instead (Review Focus item 2, partial).

- [ ] **Step 4: Commit**

```bash
git add src/components/my-glow/UpcomingBookingCard.tsx src/app/my-glow/page.tsx
git commit -m "feat: add upcoming booking card to My Glow dashboard"
```

---

### Task 7: My Services history list

**Files:**
- Create: `src/components/my-glow/MyServicesList.tsx`
- Modify: `src/app/my-glow/page.tsx` (wire it in)

**Interfaces:**
- Consumes: `RecentAppointment[]` from Task 3.
- Produces: `MyServicesList` default export, props `{ appointments: RecentAppointment[] }`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/my-glow/MyServicesList.tsx
import Image from "next/image";
import type { RecentAppointment } from "@/lib/supabase/queries/myGlow";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-amber-100 text-amber-700",
  checked_in: "bg-blue-100 text-blue-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  no_show: "bg-red-100 text-red-600",
  conflict: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

const statusLabels: Record<string, string> = {
  pending: "Upcoming",
  confirmed: "Upcoming",
  checked_in: "Upcoming",
  in_service: "Upcoming",
  completed: "Completed",
  no_show: "No Show",
  conflict: "Conflict",
  cancelled: "Cancelled",
};

export default function MyServicesList({
  appointments,
}: {
  appointments: RecentAppointment[];
}) {
  return (
    <div id="services" className="rounded-3xl border border-rose/60 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">My Services</h3>
      </div>

      <div className="mt-4 space-y-3">
        {appointments.length === 0 && (
          <p className="py-6 text-center text-sm text-ink/40">No services booked yet.</p>
        )}
        {appointments.map((a) => (
          <div key={a.id} className="flex items-center gap-3">
            <Image
              src="/images/services/spaservice.jpg"
              alt={a.serviceName ?? "Service"}
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">{a.serviceName ?? "Appointment"}</p>
              <p className="text-xs text-ink/50">
                {new Date(a.scheduledDate).toLocaleDateString()}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                statusStyles[a.status] ?? "bg-ink/10 text-ink/50"
              }`}
            >
              {statusLabels[a.status] ?? a.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page**

Add the import `import MyServicesList from "@/components/my-glow/MyServicesList";` and replace the remaining `<pre>` dump's `recent` portion with `<MyServicesList appointments={recent} />`, keeping `profile`/`reviewable`/`myReviews`/`defaultBranch` in the shrinking `<pre>` for now:

```tsx
        <div className="mx-auto max-w-4xl space-y-6">
          <UpcomingBookingCard appointment={upcoming} />
          <MyServicesList appointments={recent} />
          <pre className="overflow-auto rounded-2xl bg-white p-6 text-xs">
            {JSON.stringify({ profile, reviewable, myReviews, defaultBranch }, null, 2)}
          </pre>
        </div>
```

- [ ] **Step 3: Verify in the browser**

Logged in as the seeded customer: history list shows past/upcoming appointments with correct status badges. Confirm the empty-state message renders for an account with no appointments (Review Focus item 2).

- [ ] **Step 4: Commit**

```bash
git add src/components/my-glow/MyServicesList.tsx src/app/my-glow/page.tsx
git commit -m "feat: add My Services history list to My Glow dashboard"
```

---

### Task 8: Glow Rewards card

**Files:**
- Create: `src/components/my-glow/GlowRewardsCard.tsx`
- Modify: `src/app/my-glow/page.tsx` (wire it in)

**Interfaces:**
- Consumes: `getTierProgress` from Task 2 (`@/lib/myGlowTiers`); `points: number` (from `profile.loyalty_points`).
- Produces: `GlowRewardsCard` default export, props `{ points: number }`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/my-glow/GlowRewardsCard.tsx
import { getTierProgress } from "@/lib/myGlowTiers";

export default function GlowRewardsCard({ points }: { points: number }) {
  const progress = getTierProgress(points);

  return (
    <div id="rewards" className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="text-lg font-semibold text-ink">My Glow Rewards</h3>
      <p className="mt-4 text-4xl font-bold text-coral-dark">
        {progress.points.toLocaleString()}
      </p>
      <p className="text-sm text-ink/60">Glow Points</p>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-blush">
        <div
          className="h-full rounded-full bg-coral"
          style={{ width: `${progress.progressPercent}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-sm text-ink/60">
        <span>{progress.tier} Member</span>
        {progress.nextTier ? (
          <span>
            {progress.pointsToNext} pts to {progress.nextTier}
          </span>
        ) : (
          <span>Max tier reached</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page**

Add the import and replace the shrinking `<pre>` again, keeping only `reviewable`/`myReviews`/`defaultBranch` in it:

```tsx
        <div className="mx-auto max-w-4xl space-y-6">
          <UpcomingBookingCard appointment={upcoming} />
          <MyServicesList appointments={recent} />
          <GlowRewardsCard points={profile.loyalty_points} />
          <pre className="overflow-auto rounded-2xl bg-white p-6 text-xs">
            {JSON.stringify({ reviewable, myReviews, defaultBranch }, null, 2)}
          </pre>
        </div>
```

- [ ] **Step 3: Verify boundary math live**

Logged in as the seeded customer, note the card's points/tier/progress bar. In the Supabase SQL editor, temporarily set that account's `profiles.loyalty_points` to `0`, `999`, `1000`, `4999`, `5000`, and `9000` (reload the page each time) — confirm tier name and "pts to next" match the values verified in Task 2 Step 2, and the bar never overflows or goes negative (Review Focus item 3). Reset `loyalty_points` back to its original value afterward.

- [ ] **Step 4: Commit**

```bash
git add src/components/my-glow/GlowRewardsCard.tsx src/app/my-glow/page.tsx
git commit -m "feat: add Glow Rewards card to My Glow dashboard"
```

---

### Task 9: Welcome banner, Glow Journey banner, and journey placeholder page

**Files:**
- Create: `src/components/my-glow/WelcomeBanner.tsx`
- Create: `src/components/my-glow/GlowJourneyBanner.tsx`
- Create: `src/app/my-glow/journey/page.tsx`
- Modify: `src/app/my-glow/page.tsx` (wire both banners in)

**Interfaces:**
- Consumes: `firstName: string` (banner), nothing (journey banner/page are static).
- Produces: `WelcomeBanner` default export `{ firstName: string }`; `GlowJourneyBanner` default export (no props); the `/my-glow/journey` route.

- [ ] **Step 1: Write WelcomeBanner**

```tsx
// src/components/my-glow/WelcomeBanner.tsx
import Link from "next/link";
import { Calendar, ClipboardList, Gift, Star } from "lucide-react";

const actions = [
  { label: "Book Appointment", href: "/services", icon: Calendar },
  { label: "My Bookings", href: "#services", icon: ClipboardList },
  { label: "My Reviews", href: "#reviews", icon: Star },
  { label: "My Rewards", href: "#rewards", icon: Gift },
];

export default function WelcomeBanner({ firstName }: { firstName: string }) {
  return (
    <div className="rounded-3xl bg-ink p-8 text-white">
      <p className="text-lg">Welcome back, {firstName}! 👋</p>
      <h1 className="mt-2 text-4xl font-semibold">
        Indulge in <span className="italic text-gold">Absolute Serenity</span>
      </h1>
      <p className="mt-3 max-w-xl text-white/80">
        Rejuvenate your mind, body, and soul with our curated selection of
        luxury spa treatments.
      </p>

      <div className="mt-6 flex flex-wrap gap-6">
        {actions.map(({ label, href, icon: Icon }) => (
          <Link key={label} href={href} className="flex flex-col items-center gap-2 text-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Icon className="h-5 w-5" />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write GlowJourneyBanner**

```tsx
// src/components/my-glow/GlowJourneyBanner.tsx
import Link from "next/link";

export default function GlowJourneyBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-rose/40 p-6">
      <div>
        <p className="text-lg font-semibold text-ink">Your Glow Journey</p>
        <p className="text-sm text-ink/60">
          Track your wellness progress and unlock a more radiant you.
        </p>
      </div>
      <Link
        href="/my-glow/journey"
        className="rounded-full border border-coral px-5 py-2 text-sm font-semibold text-coral-dark hover:bg-blush"
      >
        View My Journey
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Write the journey placeholder page**

```tsx
// src/app/my-glow/journey/page.tsx
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function GlowJourneyPage() {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-blush/30 px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold text-ink">Your Glow Journey</h1>
        <p className="max-w-md text-ink/60">
          We&apos;re building a way for you to track your wellness milestones.
          Coming soon!
        </p>
        <Link
          href="/my-glow"
          className="rounded-full bg-coral px-6 py-2.5 font-semibold text-white hover:bg-coral-dark"
        >
          Back to My Glow
        </Link>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 4: Wire the banners into the page**

Add the imports and wrap the existing content, adding `WelcomeBanner` above and `GlowJourneyBanner` below:

```tsx
import WelcomeBanner from "@/components/my-glow/WelcomeBanner";
import GlowJourneyBanner from "@/components/my-glow/GlowJourneyBanner";
```

```tsx
        <div className="mx-auto max-w-4xl space-y-6">
          <WelcomeBanner firstName={profile.full_name.split(" ")[0]} />
          <UpcomingBookingCard appointment={upcoming} />
          <MyServicesList appointments={recent} />
          <GlowRewardsCard points={profile.loyalty_points} />
          <pre className="overflow-auto rounded-2xl bg-white p-6 text-xs">
            {JSON.stringify({ reviewable, myReviews, defaultBranch }, null, 2)}
          </pre>
          <GlowJourneyBanner />
        </div>
```

- [ ] **Step 5: Verify in the browser**

`/my-glow` shows the welcome banner with the customer's first name and the quick-action links, and the Glow Journey banner at the bottom. Clicking "View My Journey" loads `/my-glow/journey` with the coming-soon message and a working "Back to My Glow" link.

- [ ] **Step 6: Commit**

```bash
git add src/components/my-glow/WelcomeBanner.tsx src/components/my-glow/GlowJourneyBanner.tsx src/app/my-glow/journey/page.tsx src/app/my-glow/page.tsx
git commit -m "feat: add welcome banner and Glow Journey teaser to My Glow dashboard"
```

---

### Task 10: Reviews panel (write + my reviews)

**Files:**
- Create: `src/components/my-glow/ReviewsPanel.tsx`
- Modify: `src/app/my-glow/page.tsx` (wire it in, remove the final `<pre>`)

**Interfaces:**
- Consumes: `submitReview`, `ReviewableProfessional[]`, `MyReview[]`, `DefaultBranch` from Task 3.
- Produces: `ReviewsPanel` default export, props `{ clientId: string; reviewable: ReviewableProfessional[]; defaultBranch: DefaultBranch; myReviews: MyReview[] }`.

**Prerequisite:** Task 1's migration must be applied to the live database before this task's submit flow can be verified (it will 400 on insert with an "unknown column professional_id" error otherwise).

- [ ] **Step 1: Write the component**

```tsx
// src/components/my-glow/ReviewsPanel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  submitReview,
  type DefaultBranch,
  type MyReview,
  type ReviewableProfessional,
} from "@/lib/supabase/queries/myGlow";

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} star`}>
          <Star className={`h-5 w-5 ${n <= value ? "fill-gold text-gold" : "text-ink/20"}`} />
        </button>
      ))}
    </div>
  );
}

function ReviewForm({
  targetLabel,
  onSubmit,
}: {
  targetLabel: string;
  onSubmit: (rating: number, text: string) => Promise<string | null>;
}) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (rating === 0) {
      setError("Please pick a star rating.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const err = await onSubmit(rating, text);
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <div className="rounded-2xl border border-ink/10 p-4">
      <p className="text-sm font-medium text-ink">{targetLabel}</p>
      <div className="mt-2">
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share your experience..."
        rows={3}
        className="mt-2 w-full rounded-xl border border-ink/15 p-2 text-sm outline-none focus:border-coral"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-2 rounded-full bg-coral px-4 py-1.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-40"
      >
        {submitting ? "Submitting…" : "Write a Review"}
      </button>
    </div>
  );
}

export default function ReviewsPanel({
  clientId,
  reviewable,
  defaultBranch,
  myReviews,
}: {
  clientId: string;
  reviewable: ReviewableProfessional[];
  defaultBranch: DefaultBranch;
  myReviews: MyReview[];
}) {
  const [tab, setTab] = useState<"write" | "mine">("write");
  const router = useRouter();

  async function handleSubmit(
    target: { professionalId?: string; branchId?: string },
    rating: number,
    text: string
  ): Promise<string | null> {
    const supabase = createClient();
    const { error } = await submitReview(supabase, {
      clientId,
      rating,
      text,
      ...target,
    });
    if (!error) router.refresh();
    return error;
  }

  return (
    <div id="reviews" className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="text-lg font-semibold text-ink">Reviews & Comments</h3>

      <div className="mt-3 flex gap-4 border-b border-ink/10 text-sm font-medium">
        <button
          onClick={() => setTab("write")}
          className={`pb-2 ${tab === "write" ? "border-b-2 border-coral text-coral-dark" : "text-ink/50"}`}
        >
          Write a Review
        </button>
        <button
          onClick={() => setTab("mine")}
          className={`pb-2 ${tab === "mine" ? "border-b-2 border-coral text-coral-dark" : "text-ink/50"}`}
        >
          My Reviews ({myReviews.length})
        </button>
      </div>

      {tab === "write" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {reviewable[0] ? (
            <ReviewForm
              targetLabel={`Review ${reviewable[0].professionalName}`}
              onSubmit={(rating, text) =>
                handleSubmit({ professionalId: reviewable[0].professionalId }, rating, text)
              }
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-ink/15 p-4 text-sm text-ink/50">
              Book and complete a service to review your therapist.
            </div>
          )}

          {defaultBranch ? (
            <ReviewForm
              targetLabel={`Review ${defaultBranch.name}`}
              onSubmit={(rating, text) =>
                handleSubmit({ branchId: defaultBranch.id }, rating, text)
              }
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-ink/15 p-4 text-sm text-ink/50">
              Visit a branch to leave a spa review.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {myReviews.length === 0 && (
            <p className="py-6 text-center text-sm text-ink/40">No reviews yet.</p>
          )}
          {myReviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-ink/10 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-ink">{r.targetName}</p>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={`h-4 w-4 ${n <= r.rating ? "fill-gold text-gold" : "text-ink/20"}`}
                    />
                  ))}
                </div>
              </div>
              {r.text && <p className="mt-1 text-sm text-ink/60">{r.text}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it in and remove the placeholder `<pre>`**

Add the import and replace the final `<pre>` block:

```tsx
import ReviewsPanel from "@/components/my-glow/ReviewsPanel";
```

```tsx
        <div className="mx-auto max-w-4xl space-y-6">
          <WelcomeBanner firstName={profile.full_name.split(" ")[0]} />
          <UpcomingBookingCard appointment={upcoming} />
          <MyServicesList appointments={recent} />
          <GlowRewardsCard points={profile.loyalty_points} />
          <ReviewsPanel
            clientId={auth.user.id}
            reviewable={reviewable}
            defaultBranch={defaultBranch}
            myReviews={myReviews}
          />
          <GlowJourneyBanner />
        </div>
```

- [ ] **Step 3: Verify the full review flow**

With Task 1's migration applied: as the seeded customer with a completed appointment, submit a therapist review (pick a star rating, add text, click "Write a Review"). Confirm: the page refreshes and the "My Reviews" tab now shows it; the therapist review card disappears from the "Write a Review" tab (Review Focus item 4). Submit a spa review the same way and confirm it also appears under "My Reviews". For an account with zero completed appointments, confirm the therapist card shows the "Book and complete a service..." placeholder instead of a form (Review Focus item 2).

- [ ] **Step 4: Commit**

```bash
git add src/components/my-glow/ReviewsPanel.tsx src/app/my-glow/page.tsx
git commit -m "feat: add reviews panel to My Glow dashboard"
```

---

### Task 11: Extract shared assistant chat hook

**Files:**
- Create: `src/lib/hooks/useAssistantChat.ts`
- Modify: `src/components/ChatWidget.tsx` (use the hook instead of inline state)

**Interfaces:**
- Produces: `useAssistantChat(greeting: string): { messages: ChatMessage[]; input: string; setInput: (v: string) => void; sending: boolean; send: (text?: string) => Promise<void>; bottomRef: RefObject<HTMLDivElement> }` where `ChatMessage = { role: "user" | "assistant"; content: string }`. Consumed by `ChatWidget.tsx` (this task) and Task 12's `AssistantPanel`.

- [ ] **Step 1: Write the hook**

```ts
// src/lib/hooks/useAssistantChat.ts
"use client";

import { useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function useAssistantChat(greeting: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: greeting },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages((list) => [
        ...list,
        {
          role: "assistant",
          content: res.ok ? data.reply : (data.error ?? "Something went wrong."),
        },
      ]);
    } catch {
      setMessages((list) => [
        ...list,
        { role: "assistant", content: "Network error — try again." },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return { messages, input, setInput, sending, send, bottomRef };
}
```

- [ ] **Step 2: Refactor ChatWidget to use it**

Replace the full contents of `src/components/ChatWidget.tsx` with:

```tsx
// src/components/ChatWidget.tsx
"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useAssistantChat } from "@/lib/hooks/useAssistantChat";

const GREETING =
  "Hi! I'm the Blush Assistant. Ask me about services, prices, or branches — I can help you decide what to book.";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const { messages, input, setInput, sending, send, bottomRef } = useAssistantChat(GREETING);

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      {open && (
        <div className="mb-3 flex h-[36rem] w-96 flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="flex items-center justify-between bg-coral px-4 py-3 text-white">
            <p className="text-base font-bold tracking-wide">
              <span className="uppercase">Blush</span> Assistant
            </p>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-full p-1 hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto scrollbar-hidden p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === "user" ? "ml-auto bg-coral text-white" : "bg-blush text-ink"
                }`}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="max-w-[85%] rounded-2xl bg-blush px-3 py-2 text-sm text-ink/50">
                Typing…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-ink/10 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type your message..."
              className="flex-1 rounded-full border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="rounded-full bg-coral p-2.5 text-white hover:bg-coral-dark disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open GlowSync assistant"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-coral text-white shadow-xl hover:bg-coral-dark"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify the floating widget is unchanged**

With the dev server running, on any page as a logged-in customer: open the floating chat bubble bottom-right, send a message, confirm it still gets a reply exactly as before this refactor (same greeting text, same behavior).

- [ ] **Step 4: Commit**

```bash
git add src/lib/hooks/useAssistantChat.ts src/components/ChatWidget.tsx
git commit -m "refactor: extract shared useAssistantChat hook from ChatWidget"
```

---

### Task 12: Inline Assistant panel

**Files:**
- Create: `src/components/my-glow/AssistantPanel.tsx`
- Modify: `src/app/my-glow/page.tsx` (wire it in, finalize 3-column layout)

**Interfaces:**
- Consumes: `useAssistantChat` from Task 11; `firstName: string`.
- Produces: `AssistantPanel` default export, props `{ firstName: string }`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/my-glow/AssistantPanel.tsx
"use client";

import { Send, Sparkles } from "lucide-react";
import { useAssistantChat } from "@/lib/hooks/useAssistantChat";

const SUGGESTED_PROMPTS = [
  "Recommend a service for me",
  "Check my bookings",
  "Track my Glow Journey",
  "Find the best time to book",
  "Ask about promotions",
];

export default function AssistantPanel({ firstName }: { firstName: string }) {
  const { messages, input, setInput, sending, send, bottomRef } = useAssistantChat(
    `Hi ${firstName}! ✨ How can I help you today?`
  );

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-3xl border border-rose/60 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-coral-dark" />
        <h3 className="text-lg font-semibold text-ink">AI Assistant</h3>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
              m.role === "user" ? "ml-auto bg-coral text-white" : "bg-blush text-ink"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="max-w-[90%] rounded-2xl bg-blush px-3 py-2 text-sm text-ink/50">
            Typing…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => send(prompt)}
            disabled={sending}
            className="rounded-full border border-coral/40 px-3 py-1.5 text-left text-xs font-medium text-coral-dark hover:bg-blush disabled:opacity-40"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-ink/10 pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type your message..."
          className="flex-1 rounded-full border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          aria-label="Send"
          className="rounded-full bg-coral p-2.5 text-white hover:bg-coral-dark disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it in and switch to the 3-column layout**

Replace the page's content wrapper (currently a single `max-w-4xl` column) with the mockup's 3-column layout. Add the import `import AssistantPanel from "@/components/my-glow/AssistantPanel";` and replace the `<div className="mx-auto max-w-4xl space-y-6">...</div>` block with:

```tsx
        <div className="mx-auto max-w-7xl space-y-6">
          <WelcomeBanner firstName={profile.full_name.split(" ")[0]} />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6">
              <UpcomingBookingCard appointment={upcoming} />
              <ReviewsPanel
                clientId={auth.user.id}
                reviewable={reviewable}
                defaultBranch={defaultBranch}
                myReviews={myReviews}
              />
            </div>
            <div className="space-y-6">
              <MyServicesList appointments={recent} />
              <GlowRewardsCard points={profile.loyalty_points} />
            </div>
            <AssistantPanel firstName={profile.full_name.split(" ")[0]} />
          </div>

          <GlowJourneyBanner />
        </div>
```

- [ ] **Step 3: Verify in the browser**

`/my-glow` now shows three columns matching the mockup (booking+reviews / services+rewards / assistant). Click a suggested-prompt chip — confirm it sends that exact text and a reply appears. Confirm the layout stacks to one column on a narrow viewport (resize below Tailwind's `lg` breakpoint).

- [ ] **Step 4: Commit**

```bash
git add src/components/my-glow/AssistantPanel.tsx src/app/my-glow/page.tsx
git commit -m "feat: add inline AI assistant panel and finalize My Glow layout"
```

---

### Task 13: Assistant context-awareness

**Files:**
- Modify: `src/app/api/assistant/route.ts`

**Interfaces:**
- Consumes: `getUpcomingAppointment` from Task 3; `getTierProgress` from Task 2.
- Produces: no new exports — this changes the existing `POST` handler's behavior only.

- [ ] **Step 1: Add user context to the system prompt**

Replace the full contents of `src/app/api/assistant/route.ts` with:

```ts
// src/app/api/assistant/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { branchContacts, branchServiceCategories } from "@/lib/data";
import { getUpcomingAppointment } from "@/lib/supabase/queries/myGlow";
import { getTierProgress } from "@/lib/myGlowTiers";

const GEMINI_MODEL = "gemini-2.5-flash-lite";

function buildSystemPrompt(userContext: string) {
  const branches = branchContacts
    .map((b) => `- ${b.name} (${b.area}): ${b.address}`)
    .join("\n");

  const services = branchServiceCategories
    .map(
      (cat) =>
        `${cat.label}:\n` +
        cat.services.map((s) => `  - ${s.name} (${s.duration}) — ₱${s.price}`).join("\n")
    )
    .join("\n");

  return `You are the GlowSync booking assistant for Blush Spa & Aesthetics, a wellness spa in Pagadian City, Philippines.
Help customers pick services, compare branches, and understand pricing and the booking flow.
Be brief and friendly. Do not invent services, prices, or branches beyond what's listed below.
You cannot book on the customer's behalf — direct them to use the "Book an Experience" / "Book Now" buttons on the site.

${userContext}

Branches:
${branches}

Services:
${services}`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, loyalty_points")
    .eq("id", auth.user.id)
    .single();

  if (profile?.role !== "customer") {
    return NextResponse.json(
      { error: "Assistant is available for customer accounts only." },
      { status: 403 }
    );
  }

  const { messages } = (await request.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No messages provided." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Assistant is not configured." }, { status: 500 });
  }

  const upcoming = await getUpcomingAppointment(supabase, auth.user.id);
  const tier = getTierProgress(profile.loyalty_points);

  const userContext = `The customer you're talking to is ${profile.full_name}.
Their loyalty status: ${tier.points} Glow Points, ${tier.tier} tier.
${
  upcoming
    ? `Their next booking is ${upcoming.serviceName ?? "a service"}${
        upcoming.professionalName ? ` with ${upcoming.professionalName}` : ""
      } on ${upcoming.scheduledDate} at ${upcoming.startTime}.`
    : "They have no upcoming bookings."
}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: buildSystemPrompt(userContext) }] },
        contents,
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    return NextResponse.json(
      { error: errBody?.error?.message ?? "Assistant request failed." },
      { status: 502 }
    );
  }

  const data = await res.json();
  const reply: string =
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    "Sorry, I couldn't come up with a response. Try rephrasing?";

  return NextResponse.json({ reply });
}
```

- [ ] **Step 2: Verify with and without an upcoming booking**

As the seeded customer with an upcoming appointment, ask the assistant (via the inline panel or floating widget) "check my bookings" — confirm the reply correctly names the real service/date. Temporarily reassign or cancel that appointment (or test with a second account that has none), ask again, and confirm the reply truthfully says there are no upcoming bookings rather than inventing one (Review Focus item 5). Restore any temporarily changed data afterward.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/assistant/route.ts
git commit -m "feat: make assistant aware of the caller's own booking and rewards"
```

---

### Task 14: Final manual QA pass

**Files:** none (verification only).

- [ ] **Step 1: Walk the spec's full test plan**

Using the `run` skill against the dev server, as a seeded customer account with at least one completed and one upcoming appointment:

1. Confirm "My Glow" appears in the nav only for that account (check absence when logged out and, if available, when logged in as a non-customer role).
2. Confirm the upcoming booking card, service history, and rewards card render correctly against real Supabase data.
3. Submit a therapist review and a spa review; confirm both appear under "My Reviews" and the therapist card is hidden afterward.
4. Ask the assistant "check my bookings" and confirm truthful, personalized replies (with and without an upcoming booking).
5. Click "View My Journey" and confirm the coming-soon page renders and links back correctly.

- [ ] **Step 2: Walk the Review Focus list explicitly**

Confirm each of the five Review Focus items from the top of this plan individually: non-customer/guest redirect, zero-appointment empty states (use a second, fresh test account with no appointments if one exists, or temporarily note simulated results), tier boundary math, hidden-after-review card, and truthful no-booking assistant replies.

- [ ] **Step 3: Report results**

Summarize pass/fail for each of the above to the user. Any failure found here should be fixed in the task that owns the relevant file before considering the plan complete.
