# Admin Broadcast Notifications & Deep-Link Redirect — Design Spec

Date: 2026-09-25
Status: Approved (in-chat design confirmed by user 2026-09-25)

## Purpose

Let admin send a one-off email announcement (e.g. a new promo) to every
client at once, with a link in the email that takes the client straight
into the booking flow — logging them in first if needed, then continuing
automatically, instead of dropping them on the homepage to start over.

This is phase 1 of a larger notification idea the user described (which
also included Facebook Messenger delivery and per-appointment
confirmations/reminders). Both of those are deliberately out of scope
here:

- **Messenger** requires a Facebook Page + Facebook App with Messenger
  enabled, and Meta only allows messaging a customer who has messaged the
  Page first (or opted in via a subscribe widget) without going through
  App Review. That's an external setup process outside this codebase —
  a later phase, once the user has that in place.
- **Per-appointment notifications** (confirmations, reminders tied to one
  specific client/booking) need single-client targeting, which the user
  explicitly deferred in favor of broadcast-to-all-clients only, for now.

## Current state (why this doesn't exist today)

- No email-sending capability exists anywhere in this codebase — no
  provider, no API route, no templates.
- No "promo details" page exists — promotions (`branch_promotions`) are
  only ever shown inline during the booking flow (Spa Package category),
  never as their own linkable page. A notification link therefore points
  at the booking flow, not a promo page that doesn't exist.
- Login (`LoginModalContext`) and Booking (`BookingContext`) are both
  global React Context overlays mounted once in `src/app/layout.tsx`,
  available on every page — neither has its own route. This actually
  makes deep-linking simpler: a link just needs to land on any page with
  a query param, not resolve a specific URL structure per destination.
- `BookingContext.open(service)` already checks auth and opens the Login
  modal if the user isn't signed in (`src/components/booking/BookingContext.tsx:24-34`)
  — but it silently drops the booking intent. After the user logs in,
  nothing re-opens the booking modal; they have to click "Book Now"
  again. This is a real, pre-existing gap in the *normal* (non-notification)
  booking flow, not just a notification-specific problem.
- The OAuth callback route (`src/app/auth/callback/route.ts:7,33`)
  **already** accepts a `?next=` query param and redirects there after a
  successful login — it's just never populated. `LoginCard.tsx`'s
  `handleOAuth` hardcodes `redirectTo: `${origin}/auth/callback`` with no
  `next`, so it always defaults to `/`.
- The Login screen (`src/components/auth/LoginCard.tsx:71-75`) already
  has an "I'd like to receive exclusive offers and beauty trends from
  GlowSync" checkbox — it's decorative, not wired to any state or saved
  anywhere. Per the user's explicit decision, broadcasts will **not**
  respect this checkbox for now (send to all clients regardless); wiring
  it up is left for later.
- `BookingModal`'s `service: BookableService` prop (name/duration/price)
  is accepted but never actually read anywhere inside the component (the
  modal fetches its own real service catalog later in the flow) —
  confirmed by search. A placeholder value is safe to pass when opening
  it from a deep link.

## 1. Deep-link + post-login redirect

**Link format:** `https://<site>/?intent=booking` — lands on any page
(the query param is read regardless of which page it's on, since the
intent handler is mounted at the app root).

**New component** `src/components/notifications/IntentHandler.tsx`,
mounted in `src/app/layout.tsx` inside the existing providers:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBooking } from "@/components/booking/BookingContext";
import { createClient } from "@/lib/supabase/client";

const PLACEHOLDER_SERVICE = { name: "GlowSync Booking", duration: "", price: 0 };

export default function IntentHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openBooking } = useBooking();

  useEffect(() => {
    const intent = searchParams.get("intent");
    if (intent !== "booking") return;

    const supabase = createClient();

    async function resolve() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return; // not logged in yet — Login modal handles the redirect round trip
      await openBooking(PLACEHOLDER_SERVICE);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("intent");
      const rest = params.toString();
      router.replace(rest ? `?${rest}` : window.location.pathname);
    }

    resolve();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") resolve();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}
```

This fires the intent immediately if already logged in, and again via
`onAuthStateChange` if the user logs in afterward — covering both the
OAuth-redirect-and-back case and the in-page email/password login case
(`StaffLoginForm`'s `onSuccess`), without needing separate code paths for
each.

**Modify `src/components/auth/LoginCard.tsx`** (`handleOAuth`, line
19-24): carry the current full path+query through the OAuth round trip
instead of always defaulting to `/`:

```ts
const nextUrl = `${window.location.pathname}${window.location.search}`;
const { error } = await supabase.auth.signInWithOAuth({
  provider,
  options: {
    redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`,
  },
});
```

No changes needed to `src/app/auth/callback/route.ts` — it already reads
`next` and redirects there (line 7, 33).

This also fixes the pre-existing gap noted above: a logged-out customer
clicking "Book Now" anywhere in the app now resumes the booking flow
automatically after login, instead of having to click it again.

## 2. Broadcast email sending

**Provider: Resend.** Requires the user to create a free Resend account
and provide an API key (`RESEND_API_KEY` in `.env.local`), the same
pattern already used for Supabase credentials this session. Sending
through a personal Gmail account was explicitly ruled out — Google
actively discourages/blocks automated bulk sending from personal
accounts, and Resend is built for exactly this use case with no lengthy
approval process (unlike Messenger).

**New migration** `supabase/migrations/020_notification_broadcasts.sql`:

```sql
create table if not exists notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  message text not null,
  link_path text not null default '/?intent=booking',
  sent_by uuid not null references profiles(id) on delete cascade,
  recipient_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table notification_broadcasts enable row level security;

drop policy if exists "admin manage notification_broadcasts" on notification_broadcasts;
create policy "admin manage notification_broadcasts" on notification_broadcasts for all
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```

**New server route** `src/app/api/admin/notifications/broadcast/route.ts`
(`POST`):

1. Server-side Supabase client (`@/lib/supabase/server`), confirm the
   caller is authenticated and `profiles.role = 'admin'` — reject
   otherwise (matches the role-check pattern already used in page-level
   guards elsewhere, e.g. `src/app/frontdesk/staff/page.tsx`).
2. Parse `{ subject: string, message: string }` from the request body;
   reject empty subject/message.
3. Fetch every `profiles` row where `role = 'customer'` and `email is
   not null`.
4. If zero recipients, return an error — nothing to send.
5. Build the email: subject as given, message as given, a styled CTA
   button linking to `${origin}/?intent=booking`, branded with the same
   gold/coral (`--color-coral`) and ink colors used everywhere else in
   this app.
6. Send via Resend's batch send endpoint, chunked at 100 recipients per
   call (Resend's batch limit). Continue through chunks even if one
   fails; track total successes.
7. Insert one `notification_broadcasts` row with the real
   `recipient_count` (successes only, not attempted count).
8. Return `{ sentCount, totalRecipients }` — if `sentCount <
   totalRecipients`, the client surfaces "Sent to N of M — some
   deliveries failed" instead of a bare success message.

**New query helper** `src/lib/supabase/queries/notificationBroadcasts.ts`:
- `getEligibleRecipientCount(supabase): Promise<number>` — count of
  `profiles` where `role = 'customer' and email is not null`, for the
  live "sends to N clients" count in the compose form.
- `getBroadcastHistory(supabase): Promise<NotificationBroadcast[]>` —
  recent rows from `notification_broadcasts`, newest first, joined with
  `sent_by`'s `full_name`.

## 3. Admin UI

**New page** `src/app/admin/notifications/page.tsx` (server component):
fetches `getEligibleRecipientCount` and `getBroadcastHistory`, renders
`NotificationsManager` (client component) with that data as props.

**New component**
`src/components/admin/notifications/NotificationsManager.tsx`:
- Subject input, Message textarea.
- A line showing "This will send to {count} client{s}" (real count from
  the server-fetched prop).
- **Send** button — disabled if subject/message empty or recipient count
  is 0. Clicking opens a confirm dialog (matching the confirm-before-submit
  pattern already used for Leave Requests / Branch Transfer requests /
  Add Day Off elsewhere in this app) naming the exact recipient count and
  subject before actually calling the broadcast route.
- If `RESEND_API_KEY` isn't configured, the route returns a specific
  error the UI surfaces as "Email sending isn't set up yet — add
  RESEND_API_KEY to continue," not a generic failure.
- Below the form: a history list (subject, sent-by name, recipient
  count, relative time) from `getBroadcastHistory`, refreshed after each
  successful send.

**Modify `src/components/admin/AdminSidebar.tsx`** (`navItems`, line
18-25): add
`{ href: "/admin/notifications", label: "Notifications", icon: Bell }`
(new `Bell` import from `lucide-react`).

**Modify `src/components/admin/dashboard/CommandCenter.tsx`** (`actions`,
line 11-15): add
`{ label: "Send Notification", icon: Bell, href: "/admin/notifications", onClick: null }`
as a fourth quick action, following the same `href`-based pattern already
used for "Add Branch".

## 4. Error handling

- **Not an admin** hitting the API route directly → 403, generic
  "Not authorized."
- **No recipients** → Send button disabled client-side; route also
  rejects server-side as defense in depth (the route is reachable
  directly, not just through the UI).
- **Resend not configured** (`RESEND_API_KEY` missing/invalid) → route
  returns a distinguishable error; UI shows the specific "not set up
  yet" message rather than a generic failure, so the user knows exactly
  what to do (matches the pattern already used this session for
  migration-not-yet-applied states).
- **Partial send failure** (some recipients fail, e.g. bad address) →
  broadcast still logs with the real successful count; UI reports
  "Sent to N of M."
- **Deep link with an unrecognized `intent` value** → `IntentHandler`
  simply does nothing (no error, no crash) — only `intent=booking` is
  handled in this phase; future intents extend the same `if` without
  restructuring.
- **Already logged in when clicking the link** → `IntentHandler` fires
  immediately, no Login detour.

## 5. Testing

No automated test framework exists in this repo (consistent with the
rest of the app). Verified manually via the `run` skill:

1. Add `RESEND_API_KEY` to `.env.local`, confirm the Notifications page
   loads without the "not set up" message.
2. As admin, open `/admin/notifications` (via sidebar) and via the
   Dashboard's "Send Notification" button — confirm both land on the
   same page, and the recipient count matches the real number of
   customer profiles with an email.
3. Compose and send a test broadcast; confirm it arrives in a real inbox
   with correct branding, subject, message, and a working link.
4. Click the link while logged out; confirm it opens Login, and after
   completing Google/Facebook login, the booking flow opens
   automatically with no extra click.
5. Click the link while already logged in; confirm the booking flow
   opens immediately.
6. Confirm the sent broadcast appears in the history list with the
   correct recipient count and sender name.
7. Confirm the existing in-app "Book Now" flow (unrelated to
   notifications) also now resumes automatically after a logged-out user
   completes login, instead of requiring a second click.
