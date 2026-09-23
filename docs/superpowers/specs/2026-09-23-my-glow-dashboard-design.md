# My Glow Dashboard — Design Spec

Date: 2026-09-23
Status: Approved (in-chat design confirmed by user 2026-09-23)

## Purpose

Add a client-facing dashboard, "My Glow," reachable from a new nav link next
to "About Us" that only appears for logged-in customers. It consolidates a
client's upcoming booking, service history, reviews, loyalty rewards, an
AI assistant, and a "Glow Journey" teaser into one page, matching the
provided mockup.

## Out of scope

- Per-service / per-professional photo uploads. The DB has no image column
  on `services` or `professionals`; the dashboard reuses existing static
  spa imagery (`/images/services/spaservice.jpg`) as a placeholder thumbnail
  and initials-avatars (same pattern already used for the user avatar in
  `Header.tsx`) for therapists.
- Actual "Glow Journey" tracking logic/schema — this ships as a banner with
  a disabled/"coming soon" CTA only (per user decision).
- Changing tier thresholds from a hardcoded ladder (no admin UI to edit
  them).

## 1. Navigation

`src/components/Header.tsx` currently renders a static `navLinks` array
unconditionally. Change to compute the link list per render:

```ts
const baseNavLinks = [
  { label: "Services", href: "/services" },
  { label: "Branches", href: "/branches" },
  { label: "Teams", href: "/#team" },
  { label: "About Us", href: "/about" },
];
// insert conditionally, after About Us, before rendering:
const navLinks = user?.role === "customer"
  ? [...baseNavLinks, { label: "My Glow", href: "/my-glow" }]
  : baseNavLinks;
```

Rendered with the same `<li><Link>` markup/active-state styling already
used for the other links — no new visual treatment needed.

## 2. Route

New file `src/app/my-glow/page.tsx`, server component following the
`about/page.tsx` pattern (`<Header /><main>...sections...</main><Footer />`).

Auth guard: since this is a server component, use
`src/lib/supabase/server.ts`'s `createClient()` to fetch the authenticated
user + profile role server-side. If no user or `role !== "customer"`,
`redirect("/")` (next/navigation). This mirrors the guard already done in
`api/assistant/route.ts`.

The page fetches its own data server-side (profile, upcoming appointment,
recent appointments, reviewable appointments, existing reviews) and passes
it as props into client components where interactivity (tabs, review
forms, chat) is needed. This avoids waterfalling client-side fetches for
data that's known at request time.

## 3. Schema change

New migration `supabase/migrations/012_professional_reviews.sql`:

```sql
alter table reviews
  add column professional_id uuid references professionals(id) on delete cascade;

alter table reviews
  alter column branch_id drop not null;

alter table reviews
  add constraint reviews_target_check
  check (branch_id is not null or professional_id is not null);
```

(`branch_id` on `reviews` was already nullable-by-default since no `not
null` was declared in the original schema — confirmed from
`supabase/schema.sql`; this migration only adds the new column and the
"at least one target" constraint.) No RLS policy changes needed — the
existing "public read reviews" / "clients create reviews" policies apply
unchanged.

## 4. Data access

New query helpers in `src/lib/supabase/queries/myGlow.ts` (client-side,
used by client components) and equivalents callable server-side for the
page's initial load:

- `getUpcomingAppointment(clientId)` — next appointment where
  `status in ('confirmed','pending')` and `scheduled_date >= today`,
  ordered ascending, joined with `services(name, duration_minutes)`,
  `professionals(name, role)`, `branches(name)`. Compute "days left" in
  the UI from `scheduled_date`.
- `getRecentAppointments(clientId, limit=10)` — all appointments
  (any status), same joins, ordered descending by date, for the "My
  Services" history list.
- `getReviewableAppointments(clientId)` — completed appointments whose
  `professional_id` has no matching `reviews` row for this client yet
  (i.e. this client has never reviewed that professional). Since `reviews`
  tracks client → professional, not client → appointment, this is a
  per-professional check: once a client reviews a professional, that
  professional's card no longer appears even if they have other completed
  appointments with them (used to decide whether to show the "Review Your
  Therapist" card and for which professional).
- `getMyReviews(clientId)` — reviews by this client, joined with
  `professionals(name)` / `branches(name)` depending on which target is
  set.
- `submitReview({ clientId, professionalId?, branchId?, rating, text })` —
  insert into `reviews`.

## 5. Dashboard sections (components under `src/components/my-glow/`)

1. **`WelcomeBanner`** — "Welcome back, {firstName}" + 4 quick-action
   anchor links (Book Appointment → `/services`, My Bookings → `#services`
   in-page anchor to section 3, My Reviews → `#reviews`, My Rewards →
   `#rewards`).
2. **`UpcomingBookingCard`** — shows the next appointment (service name,
   professional name, date, "N days left" badge, branch, duration). Empty
   state: "No upcoming bookings" + a "Book Now" button linking to
   `/services` when `getUpcomingAppointment` returns null.
3. **`MyServicesList`** — up to 10 recent appointments as rows (thumbnail,
   service name, date/time, status badge reusing the color map already
   defined in `MyBookingsPanel.tsx`).
4. **`ReviewsPanel`** — tabbed "Write a Review" / "My Reviews".
   - Write tab: therapist review card only rendered when
     `getReviewableAppointments` is non-empty (pick the most recent one);
     spa review card always available, defaulting the branch to the
     client's most recent appointment's branch. Both are a simple 1–5 star
     picker + textarea, posting via `submitReview`.
   - My Reviews tab: list from `getMyReviews`, each showing target
     (therapist or branch name), stars, text, date.
5. **`GlowRewardsCard`** — reads `profile.loyalty_points`. Tier ladder
   (hardcoded constant, `src/lib/myGlowTiers.ts`):
   `Bronze: 0, Silver: 1000, Gold: 2000, Platinum: 5000`. Renders current
   tier name, points, a progress bar to the next tier, and points
   remaining (`nextThreshold - points`); Platinum shows a "max tier"
   state with a full bar.
6. **`AssistantPanel`** — inline (non-floating) version of the chat UI.
   Refactor: extract the message-list/input/send logic from
   `ChatWidget.tsx` into a shared hook `useAssistantChat()` in
   `src/lib/hooks/useAssistantChat.ts` so both the floating `ChatWidget`
   and this inline panel share one implementation instead of duplicating
   fetch/state logic. Adds a row of suggested-prompt chips above the input
   ("Recommend a service for me", "Check my bookings", "Track my Glow
   Journey", "Find the best time to book", "Ask about promotions") that,
   on click, populate and send that exact text.
7. **`GlowJourneyBanner`** — static banner, "View My Journey" button links
   to `/my-glow/journey`, a minimal page with a "Coming soon" message and
   a link back to `/my-glow`.

## 6. Assistant context-awareness

`src/app/api/assistant/route.ts` already authenticates the user and knows
their `role` server-side. Extend `buildSystemPrompt()` to accept an
optional context block, populated (in the POST handler, using data already
fetched for the auth check) with:

```
The customer you're talking to is {full_name}.
Their loyalty status: {points} Glow Points, {tier} tier.
{Their next booking is {service} with {professional} on {date} at {time}. | They have no upcoming bookings.}
```

This block is built server-side from the authenticated user's own
`profiles` row and their own `appointments` row — never from client-sent
payload fields — so a user cannot spoof another customer's data by editing
the request body. Reuses the `getUpcomingAppointment` query helper.

## 7. Error handling

- Not logged in / not a customer → `/my-glow` redirects to `/`.
- No upcoming booking → empty state with CTA (see §5.2).
- No completed appointments → therapist review card hidden, with a small
  note ("Book a service to leave a therapist review") instead.
- Review submit failure → inline error text under the form, form stays
  filled in (no data loss).
- Assistant fetch failure → existing `ChatWidget` pattern already handles
  this (network-error message); `AssistantPanel` reuses the same
  `useAssistantChat` hook so it inherits the same handling.

## 8. Testing

No automated test framework exists in this repo (`package.json` has no
test script). Verification is manual via the `run` skill:

1. Log in as a seeded customer account with at least one completed and one
   upcoming appointment.
2. Confirm "My Glow" appears in the nav only for that account (log out /
   log in as a non-customer or guest to confirm it's absent).
3. Confirm the upcoming booking card, service history, and empty states
   render correctly against real Supabase data.
4. Submit both a therapist review and a spa review; confirm they appear
   under "My Reviews" and that the therapist's review card disappears from
   the "Write a Review" tab afterward (can't review the same professional
   twice).
5. Manually adjust `profiles.loyalty_points` for the test account (via
   Supabase SQL editor) and confirm the tier name/progress bar update
   correctly at each threshold boundary.
6. Ask the inline assistant "check my bookings" and confirm the reply
   reflects the seeded upcoming appointment truthfully.
7. Click "View My Journey" and confirm the coming-soon page renders.
