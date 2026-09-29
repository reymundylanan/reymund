# Messenger Notifications & Direct-Access Deep Links — Design Spec

Date: 2026-09-29
Status: Approved in chat section by section (2026-09-29); awaiting written-spec review

## Purpose

GlowSync sends clients Facebook Messenger notifications that contain a
button linking straight to the relevant GlowSync page. Tapping it opens
the site on that page — and if the client isn't logged in, they log in
first and are then taken there automatically.

Flow: GlowSync → client's Messenger → client taps the button → GlowSync
opens on the intended page (Login first if needed).

This is phase 2 of the notification work. Phase 1
(`2026-09-25-notification-broadcast-design.md`) delivered admin email
broadcasts and the `?intent=booking` deep link.

### In scope

| Notification | Trigger | Link target |
|---|---|---|
| Appointment reminder | Automatic, ~24h before the appointment | `/my-glow/appointments/<id>` |
| Appointment update (rescheduled / cancelled / no-show) | Automatic, on the status change | `/my-glow/appointments/<id>` |
| New promo | Admin, from the Notifications page | `/promos/<id>` |
| Booking invite | Admin, from the Notifications page | `/?intent=booking` |

### Out of scope

- Booking confirmations (explicitly not selected).
- Meta **App Review / Live mode**. Until approved, only people with a
  role on the Meta app receive messages. This is a submission to Meta,
  not code; a checklist is included in §9.
- Meta **Marketing Messages** (needed to send promos outside the 24h
  window).
- Client self-service cancel/reschedule (clients still call the branch,
  matching `MyBookingsSection.tsx`).

## Known constraints (Meta platform)

1. **A Page cannot message someone first.** Facebook Login does not give
   a Messenger ID. The client must open a conversation with the Page;
   we link it to their GlowSync account using an `m.me` link carrying a
   one-time `ref` token.
2. **24-hour window.** Free-form messages (promos, invites) may only be
   sent within 24h of the client's last message to the Page.
3. **Message tags are gone.** Since 2026-04-27, `CONFIRMED_EVENT_UPDATE`,
   `ACCOUNT_UPDATE`, and `POST_PURCHASE_UPDATE` are rejected (error 100).
   Reminders and updates therefore use **Utility message templates**
   (`messaging_type: "UTILITY"`): created via
   `POST /<PAGE_ID>/message_templates` with `category: "UTILITY"`,
   auto-approved within seconds, sendable outside the 24h window.
   Requires the `pages_utility_messaging` permission on the Page token
   and a webhook subscription to `message_template_status_update`.
   Template bodies may not start or end with a parameter and must not
   contain marketing content.
4. **Webhook needs public HTTPS.** The app is deployed publicly; the
   webhook lives on the deployed site. Local development of the webhook
   uses a tunnel.

## Current state

- `IntentHandler` (`src/components/notifications/IntentHandler.tsx`) is
  mounted at the root and handles `?intent=booking`: opens Login if
  signed out, and the booking modal on `SIGNED_IN`.
- `LoginCard.handleOAuth` already passes the current path+query as
  `next` to `/auth/callback`, which redirects to `${origin}${next}`.
  **`next` is not validated** — `next=@evil.com` produces
  `https://site@evil.com`, an open redirect. Fixed here (§3).
- `/promos/[id]` exists and is public.
- There is no single-appointment page. `/my-glow` redirects signed-out
  users to `/`.
- `appointment_history` (migration 040) is written by a trigger on every
  status change and reschedule, with `changed_by = auth.uid()`. Only
  staff can read it today.
- Appointments: `client_id` (nullable for walk-ins), `status`
  (`confirmed`, `cancelled`, `no_show`, …), `session_status`,
  `scheduled_date` (date), `start_time` (time, Asia/Manila local),
  `reschedule_count`.
- No test framework in the repo.

## 1. Messenger account linking

### Migration `047_messenger.sql` (part 1)

```sql
create table messenger_subscriptions (
  profile_id uuid primary key references profiles(id) on delete cascade,
  psid text not null unique,
  linked_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  opted_out_at timestamptz
);
-- RLS: client can select/delete own row (profile_id = auth.uid());
-- no insert/update policies (server uses the service-role client).

create table messenger_link_tokens (
  token text primary key,               -- 32 random bytes, base64url
  profile_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,      -- now() + 15 min
  used_at timestamptz
);
-- RLS enabled, no policies (server only).
```

### Client UI

`src/components/notifications/MessengerConnectCard.tsx` (client
component), shown on `/my-glow` and on the appointment page (§4):

- Not connected → "Get appointment reminders and updates on Messenger"
  + **Connect Messenger** button. Click → `POST /api/messenger/link-token`
  → returns `{ url: "https://m.me/<PAGE_USERNAME>?ref=<token>" }` →
  `window.open(url)`. The card then polls its own subscription row every
  3s for up to 2 minutes and flips to Connected when it appears.
- Connected → "Connected ✓" + **Disconnect** (deletes own row via RLS).
- Opted out (typed STOP) → "Paused — type START in Messenger to resume."
- Messenger not configured (env missing) → card not rendered.

### `POST /api/messenger/link-token`

Signed-in customers only (401 otherwise). Inserts a token row, returns
the `m.me` URL.

### Webhook `src/app/api/messenger/webhook/route.ts`

- `GET` — return `hub.challenge` when `hub.mode === "subscribe"` and
  `hub.verify_token === MESSENGER_VERIFY_TOKEN`; else 403.
- `POST` — read raw body; verify `X-Hub-Signature-256` =
  `sha256=HMAC_SHA256(MESSENGER_APP_SECRET, rawBody)` with a
  constant-time compare; 401 on mismatch. Then for each
  `entry[].messaging[]` event (service-role client):
  - **Referral** — `event.referral.ref` (existing thread) or
    `event.postback.referral.ref` (new thread via Get Started): look up
    the token; if valid (unused, unexpired) mark it used and upsert
    `messenger_subscriptions` (`profile_id`, `psid = event.sender.id`,
    `linked_at = now()`, `last_inbound_at = now()`,
    `opted_out_at = null`). If that PSID was linked to a different
    profile, it is moved to the new one. Reply (free-form, inside the
    window just opened): "You're connected to GlowSync ✨ We'll send your
    appointment reminders and updates here." + URL button **Open My
    Glow** → `/my-glow`. Invalid token → reply "This link has expired —
    tap Connect Messenger in GlowSync again."
  - **Any inbound message/postback** — set `last_inbound_at = now()` for
    that PSID.
  - **Text `STOP`** (case-insensitive, trimmed) — set `opted_out_at`,
    reply confirmation. **`START`** — clear it, reply confirmation.
  - `message_template_status_update` events — log only.
  - Any processing error is logged and the route still returns 200 so
    Meta does not retry or disable the webhook.

### One-time setup script `scripts/messenger-setup.mjs`

Run with `node --env-file=.env.local scripts/messenger-setup.mjs`.
Idempotent:
1. Sets the Page's Get Started button and greeting
   (`POST /me/messenger_profile`).
2. Creates the four utility templates (§2) if they don't exist,
   printing each status.

### Environment variables

| Var | Purpose |
|---|---|
| `MESSENGER_PAGE_ID` | Page ID for Send API and templates |
| `MESSENGER_PAGE_ACCESS_TOKEN` | Page token (needs `pages_messaging`, `pages_utility_messaging`) |
| `MESSENGER_APP_SECRET` | Webhook signature verification |
| `MESSENGER_VERIFY_TOKEN` | Webhook GET handshake |
| `MESSENGER_DISPATCH_SECRET` | Auth for the dispatcher route |
| `NEXT_PUBLIC_MESSENGER_PAGE_USERNAME` | For `m.me` links |
| `NEXT_PUBLIC_SITE_URL` | Absolute base for links in messages |

"Messenger configured" = all of the above present
(`src/lib/messenger/config.ts`).

## 2. Outbox, triggers, and dispatch

### Migration `047_messenger.sql` (part 2)

```sql
create table messenger_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('reminder','appointment_update','promo','booking_invite')),
  appointment_id uuid references appointments(id) on delete cascade,
  promo_id uuid references branch_promotions(id) on delete set null,
  broadcast_id uuid references notification_broadcasts(id) on delete set null,
  update_type text check (update_type in ('rescheduled','cancelled','no_show')),
  custom_text text,
  link_path text not null,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','skipped')),
  skip_reason text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index messenger_outbox_one_reminder
  on messenger_outbox (appointment_id) where kind = 'reminder';
create index messenger_outbox_due on messenger_outbox (next_attempt_at)
  where status = 'pending';
-- RLS: admin select only. Writes via service role / security definer.
```

### Update trigger (C)

`enqueue_messenger_appointment_update()` — `security definer`,
`after insert on appointment_history for each row`. Enqueues one
`appointment_update` row when all hold:
- event is `reschedule` → `update_type = 'rescheduled'`; or
  `status_change` with `to_value = 'cancelled'` → `'cancelled'`; or
  `to_value = 'no_show'` → `'no_show'`;
- the appointment's `client_id` is not null;
- `changed_by is distinct from client_id` (don't notify clients about
  their own actions);
- the client has a `messenger_subscriptions` row with
  `opted_out_at is null`.

`link_path = '/my-glow/appointments/' || appointment_id`.

### Reminder job (B)

`enqueue_messenger_reminders()` — `security definer`, scheduled by
`pg_cron` every 15 minutes. Inserts `reminder` rows for appointments
where `(scheduled_date + start_time) at time zone 'Asia/Manila'` is
between `now() + 23h` and `now() + 24h`, `status` not in
(`cancelled`, `no_show`), `session_status` not in (`completed`, `paid`),
client subscribed and not opted out. `on conflict do nothing` on the
unique reminder index.

### Dispatch cron

`pg_cron` every minute calls `net.http_post` (`pg_net`) to
`<site>/api/messenger/dispatch` with
`Authorization: Bearer <secret>`. Site URL and secret are read from
Supabase Vault (`vault.decrypted_secrets`, names
`messenger_dispatch_url`, `messenger_dispatch_secret`). The migration
creates the jobs; the Vault secrets are set once in the Supabase
dashboard (documented in §9). If the secrets are absent the job is a
no-op.

A `messenger_dispatch_runs` single-row table (`last_run_at`,
`last_sent`, `last_failed`) is updated by each dispatcher run for the
admin status card.

### Dispatcher `src/app/api/messenger/dispatch/route.ts` (`POST`)

1. 401 unless `Authorization` matches `MESSENGER_DISPATCH_SECRET`
   (constant-time compare). 503 if Messenger isn't configured (rows stay
   pending).
2. Claim up to 50 due rows via
   `claim_messenger_outbox(limit)` — `update … set status = 'sending',
   attempts = attempts + 1 where id in (select id … where status =
   'pending' and next_attempt_at <= now() order by next_attempt_at
   for update skip locked limit $1) returning *`. Also, rows stuck in
   `sending` for >10 min are returned to `pending` at the start of each
   run.
3. For each row, load current data and decide:
   - Subscription missing or opted out → `skipped` (`not_subscribed` /
     `opted_out`).
   - `reminder`: appointment now cancelled/no-show/completed → `skipped`
     (`appointment_inactive`).
   - `promo` / `booking_invite`: `last_inbound_at` older than 24h →
     `skipped` (`outside_24h_window`).
4. Build the message (`src/lib/messenger/messages.ts`, pure functions):
   - `reminder` / `appointment_update` → **utility template** send:
     `messaging_type: "UTILITY"`, template name per kind/update_type,
     body parameters, URL button parameter = appointment id.
   - `promo` / `booking_invite` → free-form **button template**
     (`messaging_type: "RESPONSE"`): `custom_text` + one `web_url`
     button (**View promo** / **Book now**) to
     `NEXT_PUBLIC_SITE_URL + link_path`.
5. `POST https://graph.facebook.com/v23.0/<PAGE_ID>/messages` with the
   Page token. Classify the result (`src/lib/messenger/errors.ts`):
   - success → `sent`, `sent_at = now()`;
   - user unreachable / blocked the Page (Graph codes 551, 10 with
     subcode 2018108, 200) → `failed` and set that subscription's
     `opted_out_at`;
   - other client errors (4xx, e.g. code 100 bad template) → `failed`;
   - rate limit / 5xx / network → back to `pending`,
     `next_attempt_at = now() + backoff[attempts]` with backoff
     1, 5, 15, 60 min; after 5 attempts → `failed`.
   `last_error` stores the Graph error message.
6. Update `messenger_dispatch_runs`; return
   `{ claimed, sent, skipped, failed, retried }`.

The exact Graph error codes are confirmed against current Meta docs
during implementation and live in `errors.ts` only.

### Utility templates (created by the setup script)

All `language: "en"`, `category: "UTILITY"`, one URL button
**View appointment** → `<NEXT_PUBLIC_SITE_URL>/my-glow/appointments/{{1}}`.

| Name | Body |
|---|---|
| `glowsync_appt_reminder` | "Hi {{1}}, this is a reminder of your {{2}} at {{3}} on {{4}} at {{5}}. See you soon!" |
| `glowsync_appt_rescheduled` | "Hi {{1}}, your {{2}} at {{3}} has been moved to {{4}} at {{5}}. Tap below for details." |
| `glowsync_appt_cancelled` | "Hi {{1}}, your {{2}} at {{3}} on {{4}} has been cancelled. Tap below for details." |
| `glowsync_appt_no_show` | "Hi {{1}}, we missed you for your {{2}} at {{3}} on {{4}}. Tap below to see your options." |

Parameters: first name, service name, branch name, date
(e.g. "Tue, Oct 7"), time (e.g. "2:30 PM"). Because
`NEXT_PUBLIC_SITE_URL` is baked into the templates, changing the domain
requires re-running the setup script.

## 3. Safe redirects and login-then-continue

### `src/lib/safeNext.ts`

`safeNext(value: string | null | undefined): string` — returns `value`
only if it starts with `/`, does not start with `//` or `/\`, contains
no `\`, and contains no control characters; otherwise `/`.

Used by:
- `src/app/auth/callback/route.ts` — `const next = safeNext(searchParams.get("next"))`.
- `IntentHandler` — before navigating.
- `src/lib/loginRedirect.ts` — `loginRedirectPath(path)` →
  `/?login=1&next=${encodeURIComponent(path)}`.

### Protected client pages

`/my-glow`, `/my-glow/journey`, and `/my-glow/appointments/[id]`: when
there is no user, `redirect(loginRedirectPath(<own path>))` instead of
`redirect("/")`. (The wrong-role redirect stays `redirect("/")`.) Admin
and front-desk pages are unchanged.

### `IntentHandler`

Adds a `login=1` case alongside `intent=booking`:
- signed out → `openLogin()`;
- signed in (on load or on `SIGNED_IN`) → `router.replace(safeNext(next))`.

Because `LoginCard` already sends the current URL as `next` through the
OAuth round trip, OAuth returns to `/?login=1&next=…`, the user is
signed in on load, and the handler completes the hop. Email/password
login fires `SIGNED_IN` in-page and follows the same path.

## 4. Appointment detail page

`src/app/my-glow/appointments/[id]/page.tsx` (server component,
`dynamic = "force-dynamic"`):

- Signed out → `redirect(loginRedirectPath("/my-glow/appointments/" + id))`.
- Loads the appointment filtered by `id` **and** `client_id = auth.uid()`
  (new query `getClientAppointment` in
  `src/lib/supabase/queries/myGlow.ts`); missing → `notFound()`. The page
  never distinguishes "doesn't exist" from "not yours".
- Shows: service, branch, professional, date & time, status badge (same
  colour map as `MyBookingsSection`), "Originally scheduled for …" when
  `reschedule_count > 0`, a timeline from `appointment_history`
  (human-readable labels), "Need to change this? Call {branch phone}"
  with a `tel:` link, `MessengerConnectCard`, and a back link to My Glow.

Migration adds an RLS policy: clients may `select` `appointment_history`
rows whose appointment has `client_id = auth.uid()`.

`MyBookingsSection` gets a **View details** link per booking to this
page.

## 5. Admin sending (promo & booking invite)

Extend `NotificationsManager` and the broadcast route (no new page):

- **Link to** select: "Booking page" (`/?intent=booking`, default) or
  "A promo…" → picker of active `branch_promotions` → `/promos/<id>`.
  The email CTA uses the same link.
- **Channels** checkboxes: Email, Messenger (both default on; at least
  one required; Messenger disabled with a hint when not configured).
- Counts line: "Email: N clients · Messenger: M connected (K reachable
  now, within 24h)".
- Confirm dialog repeats the counts.
- Route: email sending unchanged when Email is on; when Messenger is
  on, inserts one outbox row per subscribed, non-opted-out client
  (`kind = promo | booking_invite`, `custom_text` = the message,
  `broadcast_id`). Rows outside the window are still enqueued and
  recorded as `skipped` by the dispatcher, so history shows them.
- Migration adds to `notification_broadcasts`: `channels text[] not
  null default '{email}'`, `promo_id uuid null`. (`link_path` already
  exists.)
- History rows show Messenger results per broadcast
  (sent / skipped / failed, aggregated from `messenger_outbox` by
  `broadcast_id`).
- **Messenger status card** at the top: "Not configured" (lists missing
  env var names) or last dispatcher run time + pending count, so a
  stalled cron is visible.

## 6. Error handling

| Situation | Behaviour |
|---|---|
| Webhook bad signature | 401, nothing processed |
| Webhook processing error | Logged, 200 returned |
| Dispatcher without/with wrong secret | 401 |
| Messenger env missing | Dispatcher 503, rows stay pending; UI hides/disables Messenger |
| Expired/used/unknown link token | Friendly Messenger reply |
| Client not subscribed / opted out | Never enqueued by triggers; skipped by dispatcher if state changed |
| Promo/invite outside 24h | `skipped: outside_24h_window` |
| User blocked the Page | `failed`, subscription opted out |
| Transient Graph error | Retry 1/5/15/60 min, then `failed` |
| Unsafe `next` | Falls back to `/` |
| Someone else's appointment id | 404 |
| Dispatcher crash mid-batch | Stuck `sending` rows reset after 10 min |

## 7. Testing

Add **Vitest** (dev dependency, `npm test`) for pure logic only:
- `safeNext` — accepts `/x`, `/x?a=b`; rejects `//evil.com`,
  `/\evil.com`, `@evil.com`, `https://evil.com`, `javascript:…`, empty.
- Webhook signature verification — valid, tampered body, wrong
  secret, missing header.
- Message builders — each kind produces the expected Graph payload.
- Graph error classification — sent / retry / fail / fail+opt-out.

Manual end-to-end against the real Page (app in Development mode, test
accounts with a role on the app), on the deployed site:
1. Connect from My Glow; "connected" reply arrives; card flips to
   Connected.
2. From Front Desk: reschedule, cancel, mark no-show → one message each
   with a working **View appointment** button.
3. Temporarily point the reminder window at an appointment ~now → one
   reminder, and no duplicate on the next run.
4. Tap a link while logged out → Login → lands on the appointment page
   (Google, then Facebook).
5. Admin promo broadcast on both channels → counts match; promo page
   opens from Messenger and email.
6. STOP / START in Messenger → opt-out/in reflected in the card and in
   skipped rows.
7. `/?login=1&next=@evil.com` and `/auth/callback?next=@evil.com` → `/`.
8. Open another client's appointment id → 404.
9. `npm run build` and `npm run lint` pass.

## 8. Files

New:
- `supabase/migrations/047_messenger.sql`
- `src/lib/safeNext.ts`, `src/lib/loginRedirect.ts`
- `src/lib/messenger/config.ts`, `graph.ts`, `messages.ts`, `errors.ts`, `signature.ts`
- `src/app/api/messenger/webhook/route.ts`
- `src/app/api/messenger/link-token/route.ts`
- `src/app/api/messenger/dispatch/route.ts`
- `src/app/my-glow/appointments/[id]/page.tsx`
- `src/components/notifications/MessengerConnectCard.tsx`
- `scripts/messenger-setup.mjs`
- Vitest config + `*.test.ts` next to the pure modules

Modified:
- `src/app/auth/callback/route.ts`
- `src/components/notifications/IntentHandler.tsx`
- `src/app/my-glow/page.tsx`, `src/app/my-glow/journey/page.tsx`
- `src/components/my-glow/MyBookingsSection.tsx`
- `src/lib/supabase/queries/myGlow.ts`
- `src/components/admin/notifications/NotificationsManager.tsx`
- `src/app/api/admin/notifications/broadcast/route.ts`
- `src/lib/supabase/queries/notificationBroadcasts.ts`
- `src/app/admin/notifications/page.tsx`
- `package.json`

## 9. Go-live checklist (outside the codebase)

1. Meta app: add Messenger product; connect the Page; generate a Page
   access token with `pages_messaging` and `pages_utility_messaging`.
2. Webhook: callback `https://<site>/api/messenger/webhook`, verify
   token = `MESSENGER_VERIFY_TOKEN`; subscribe the Page to `messages`,
   `messaging_postbacks`, `messaging_referrals`,
   `message_template_status_update`.
3. Vercel env: all variables in §1.
4. Supabase: enable `pg_cron` and `pg_net`; add Vault secrets
   `messenger_dispatch_url` (`https://<site>/api/messenger/dispatch`) and
   `messenger_dispatch_secret`; apply migration 047.
5. Run `scripts/messenger-setup.mjs`; confirm all four templates are
   `APPROVED`.
6. Development mode: add testers under App Roles.
7. For real clients: submit App Review for `pages_messaging` and
   `pages_utility_messaging`, then switch the app to Live.
