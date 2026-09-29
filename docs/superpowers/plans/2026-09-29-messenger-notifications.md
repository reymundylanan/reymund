# Messenger Notifications & Direct-Access Deep Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GlowSync sends clients Facebook Messenger notifications (appointment reminders, appointment updates, admin promos, booking invites) whose button opens the relevant GlowSync page, logging the client in first when needed.

**Architecture:** Clients link Messenger through an `m.me?ref=<token>` link consumed by a signed webhook. Every notification is a row in a `messenger_outbox` table (filled by a Postgres trigger, a `pg_cron` reminder job, and the admin broadcast route); a secret-protected `/api/messenger/dispatch` route, pinged every minute by `pg_cron` + `pg_net`, sends due rows through the Graph API (utility templates for appointment messages, button templates for promos/invites) with retry. Deep links land on real pages; signed-out visitors are sent to `/?login=1&next=<path>` and `IntentHandler` finishes the hop after login.

**Tech Stack:** Next.js 16.2.9 (App Router, `src/proxy.ts`), React 19, Supabase (Postgres, RLS, `pg_cron`, `pg_net`, Vault), Meta Messenger Platform Send API (Graph `v23.0`), Resend (existing), Vitest (new, unit tests only), Node 24.

**Spec:** `docs/superpowers/specs/2026-09-29-messenger-notifications-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before using any Next API you are unsure of — this Next version differs from training data (`AGENTS.md`). Page `params` is a `Promise` and must be awaited.
- Reminders and appointment updates are sent as **utility templates** (`messaging_type: "UTILITY"`); the deprecated tags `CONFIRMED_EVENT_UPDATE` / `ACCOUNT_UPDATE` / `POST_PURCHASE_UPDATE` must not be used anywhere.
- Promos and booking invites are free-form and may only be sent when the client's `last_inbound_at` is within 24 hours; otherwise the row is `skipped` with reason `outside_24h_window`.
- Graph API base: `https://graph.facebook.com/v23.0`. Page token sent as `Authorization: Bearer <token>`.
- Template names: `glowsync_appt_reminder`, `glowsync_appt_rescheduled`, `glowsync_appt_cancelled`, `glowsync_appt_no_show`; language `en`; URL button text `View appointment`; URL `<NEXT_PUBLIC_SITE_URL>/my-glow/appointments/{{1}}`.
- Env vars (exact names): `MESSENGER_PAGE_ID`, `MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_APP_SECRET`, `MESSENGER_VERIFY_TOKEN`, `MESSENGER_DISPATCH_SECRET`, `NEXT_PUBLIC_MESSENGER_PAGE_USERNAME`, `NEXT_PUBLIC_SITE_URL`.
- Appointment times (`scheduled_date` + `start_time`) are Asia/Manila local time (fixed UTC+08:00).
- Link tokens: 32 random bytes, base64url, expire after 15 minutes, single use.
- Retry backoff 1, 5, 15, 60 minutes; max 5 attempts.
- Any Messenger failure must never block or roll back a Front Desk / Admin appointment write.
- `appointments` has four FKs to `profiles`; embeds must be qualified: `profiles!appointments_client_id_fkey(...)`.
- Migrations are applied by pasting the file into the Supabase Dashboard → SQL Editor (no Supabase CLI in this repo). Next free number is `047`.
- Service-role client (`createAdminClient`, `src/lib/supabase/admin.ts`) is server-only.
- Match surrounding code style: Tailwind classes using the `ink`, `coral`, `coral-dark`, `rose`, `blush` tokens; `lucide-react` icons; `one()` helper for embedded relations.
- Commit after each task with a conventional message ending in the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Front Desk marks a no-show and both `status` and `session_status` become `no_show` in one update** → the history trigger writes two rows; the client must get exactly one "no-show" message (5-minute dedupe in the trigger; verified in Task 3 Step 4).
2. **An appointment already reminded is rescheduled to a later day** → the client gets a fresh reminder ~24h before the new time, and a reminder queued for the old time is skipped as `appointment_moved` (reminder uniqueness keyed on `(appointment_id, remind_for)`; `skipReason` tests in Task 5; SQL check in Task 3).
3. **The Messenger enqueue trigger hits an error** (e.g. a bad row) → the Front Desk's status change still succeeds (trigger body wrapped in `exception when others`; verified in Task 3 Step 4).
4. **Admin writes a message longer than Messenger's 640-character button-template limit** → it is truncated with "…", not rejected by Graph (test in Task 4).
5. **Appointment has no linked service / branch / client name** (free-text `notes` bookings, deleted staff) → template parameters fall back to non-empty defaults, since Graph rejects empty parameters (test in Task 4).

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` | Unit test runner config (`@/` alias) |
| `src/lib/safeNext.ts` (+ test) | Same-site redirect path validation |
| `src/lib/loginRedirect.ts` (+ test) | Build `/?login=1&next=…` |
| `src/lib/appointmentFormat.ts` (+ test) | Date/time formatting, status labels/styles, history descriptions — shared by UI and messages |
| `src/lib/messenger/templates.ts` | Utility template definitions + create payloads (no imports; also run by the setup script under Node) |
| `src/lib/messenger/messages.ts` (+ test) | Pure Graph payload builders |
| `src/lib/messenger/config.ts` (+ test) | Env loading / "is configured" |
| `src/lib/messenger/signature.ts` (+ test) | Webhook HMAC verification, constant-time compare |
| `src/lib/messenger/webhookEvents.ts` (+ test) | Turn a Messenger event into an action |
| `src/lib/messenger/errors.ts` (+ test) | Classify Graph responses, retry backoff |
| `src/lib/messenger/dispatchRules.ts` (+ test) | Decide whether an outbox row must be skipped |
| `src/lib/messenger/graph.ts` | `fetch` wrapper for the Send API |
| `src/lib/supabase/queries/messenger.ts` | Messenger reads for pages (client status, admin counts, dispatch status, broadcast results) |
| `src/app/api/messenger/link-token/route.ts` | Issue link token + `m.me` URL |
| `src/app/api/messenger/webhook/route.ts` | Meta webhook |
| `src/app/api/messenger/dispatch/route.ts` | Outbox sender |
| `src/components/notifications/MessengerConnectCard.tsx` | Client connect/disconnect UI |
| `src/app/my-glow/appointments/[id]/page.tsx` | Appointment detail page |
| `supabase/migrations/047_messenger.sql` | All schema, triggers, cron jobs |
| `scripts/messenger-setup.ts` | One-time Page profile + template creation |

---

### Task 1: Vitest, safe redirects, and the open-redirect fix

**Files:**
- Create: `vitest.config.ts`, `src/lib/safeNext.ts`, `src/lib/safeNext.test.ts`, `src/lib/loginRedirect.ts`, `src/lib/loginRedirect.test.ts`
- Modify: `package.json` (scripts + devDependency), `src/app/auth/callback/route.ts:7`

**Interfaces:**
- Produces: `safeNext(value: string | null | undefined): string`; `loginRedirectPath(path: string): string`; `npm test` runs Vitest.

- [ ] **Step 1: Install Vitest and add the script**

Run: `npm install --save-dev vitest@^3`
Then in `package.json` `"scripts"` add `"test": "vitest run"` after `"lint"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing tests**

`src/lib/safeNext.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it.each(["/", "/my-glow", "/my-glow/appointments/abc", "/?intent=booking", "/promos/1?x=a%20b"])(
    "accepts same-site path %s",
    (v) => expect(safeNext(v)).toBe(v)
  );

  it.each([
    null,
    undefined,
    "",
    "@evil.com",
    "evil.com",
    "//evil.com",
    "/\\evil.com",
    "/foo\\bar",
    "https://evil.com",
    "javascript:alert(1)",
    "/\t/evil.com",
    "/\n/evil.com",
  ])("rejects %s", (v) => expect(safeNext(v)).toBe("/"));
});
```

`src/lib/loginRedirect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loginRedirectPath } from "./loginRedirect";

describe("loginRedirectPath", () => {
  it("encodes the target path as next", () => {
    expect(loginRedirectPath("/my-glow/appointments/abc")).toBe(
      "/?login=1&next=%2Fmy-glow%2Fappointments%2Fabc"
    );
  });

  it("falls back to / for unsafe targets", () => {
    expect(loginRedirectPath("//evil.com")).toBe("/?login=1&next=%2F");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./safeNext` / `./loginRedirect`.

- [ ] **Step 4: Implement**

`src/lib/safeNext.ts`:

```ts
// Only same-site absolute paths may be used as post-login redirect
// targets. Anything else ("@evil.com", "//evil.com", "/\evil.com",
// schemes, control characters) falls back to "/" — otherwise
// `${origin}${next}` can be turned into a link to another site.
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}
```

`src/lib/loginRedirect.ts`:

```ts
import { safeNext } from "./safeNext";

// Where protected client pages send signed-out visitors: the home page
// with the Login modal open, continuing to `path` after sign-in
// (handled by IntentHandler).
export function loginRedirectPath(path: string): string {
  return `/?login=1&next=${encodeURIComponent(safeNext(path))}`;
}
```

In `src/app/auth/callback/route.ts` add the import and replace line 7:

```ts
import { safeNext } from "@/lib/safeNext";
```

```ts
  const next = safeNext(searchParams.get("next"));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (2 files).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/safeNext.ts src/lib/safeNext.test.ts src/lib/loginRedirect.ts src/lib/loginRedirect.test.ts src/app/auth/callback/route.ts
git commit -m "fix: validate post-login redirect target; add Vitest"
```

---

### Task 2: Login-then-continue for protected client pages

**Files:**
- Modify: `src/components/notifications/IntentHandler.tsx` (whole file), `src/app/my-glow/page.tsx:29`

**Interfaces:**
- Consumes: `safeNext`, `loginRedirectPath` (Task 1).
- Produces: any page may `redirect(loginRedirectPath(path))`; after sign-in the visitor lands on `path`.

(`/my-glow/journey` has no auth guard today and needs none — the spec's mention of it is dropped.)

- [ ] **Step 1: Replace `IntentHandler.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBooking } from "@/components/booking/BookingContext";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safeNext";

const PLACEHOLDER_SERVICE = { name: "GlowSync Booking", duration: "", price: 0 };

// Handles deep links from notifications:
// - ?intent=booking      → open the booking flow (after login if needed)
// - ?login=1&next=/path  → open Login if signed out, then go to /path
export default function IntentHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openBooking } = useBooking();
  const { open: openLogin } = useLoginModal();

  useEffect(() => {
    const intent = searchParams.get("intent");
    const wantsLogin = searchParams.get("login") === "1";
    if (intent !== "booking" && !wantsLogin) return;

    const supabase = createClient();
    let cancelled = false;

    async function resolve() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!data.user) {
        openLogin();
        return;
      }

      if (wantsLogin) {
        router.replace(safeNext(searchParams.get("next")));
        return;
      }

      await openBooking(PLACEHOLDER_SERVICE);
      if (cancelled) return;
      const params = new URLSearchParams(searchParams.toString());
      params.delete("intent");
      const rest = params.toString();
      router.replace(rest ? `?${rest}` : window.location.pathname);
    }

    resolve();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") resolve();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return null;
}
```

- [ ] **Step 2: Redirect signed-out My Glow visitors to login**

In `src/app/my-glow/page.tsx` add `import { loginRedirectPath } from "@/lib/loginRedirect";` and change line 29:

```ts
  if (!auth.user) redirect(loginRedirectPath("/my-glow"));
```

(Leave the wrong-role `redirect("/")` on line 37 as is.)

- [ ] **Step 3: Verify manually**

Run: `npm run dev` (reuse the running server on :3000 if present).
1. In a private window open `http://localhost:3000/my-glow` → lands on `/?login=1&next=%2Fmy-glow` with the Login modal open.
2. Sign in with Google → returns to `/my-glow`.
3. While signed in, open `http://localhost:3000/?login=1&next=@evil.com` → ends on `/`.
4. Open `http://localhost:3000/?intent=booking` while signed in → booking modal opens (unchanged behaviour).

- [ ] **Step 4: Lint and commit**

Run: `npm run lint` — Expected: no new errors.

```bash
git add src/components/notifications/IntentHandler.tsx src/app/my-glow/page.tsx
git commit -m "feat: continue to the intended page after login from deep links"
```

---

### Task 3: Migration 047 — Messenger schema, triggers, cron

**Files:**
- Create: `supabase/migrations/047_messenger.sql`

**Interfaces:**
- Produces (used by later tasks):
  - tables `messenger_subscriptions(profile_id, psid, linked_at, last_inbound_at, opted_out_at)`, `messenger_link_tokens(token, profile_id, expires_at, used_at)`, `messenger_outbox(id, profile_id, kind, appointment_id, promo_id, broadcast_id, update_type, remind_for, custom_text, link_path, status, skip_reason, attempts, next_attempt_at, claimed_at, last_error, created_at, sent_at)`, `messenger_dispatch_runs(id boolean, last_run_at, last_sent, last_failed)`
  - view `messenger_broadcast_results(broadcast_id, sent, skipped, failed, pending)`
  - RPC `claim_messenger_outbox(p_limit integer) returns setof messenger_outbox` (service role only)
  - `notification_broadcasts.channels text[]`, `notification_broadcasts.promo_id uuid`
  - client RLS read on own `appointment_history`

Deviation from spec (deliberate): reminder uniqueness is `(appointment_id, remind_for)` instead of `appointment_id` alone, so a rescheduled appointment gets a reminder for its new time (Review Focus 2).

- [ ] **Step 1: Write the migration**

```sql
-- 047_messenger.sql
-- Messenger notifications: account linking, an outbox of messages to
-- send, a trigger that queues appointment updates, a cron job that
-- queues ~24h reminders, and a cron job that pings the Next.js
-- dispatcher (/api/messenger/dispatch) which actually sends them.
--
-- Before the dispatcher ping does anything, add two Vault secrets
-- (Dashboard → Project Settings → Vault, or SQL):
--   select vault.create_secret('https://<site>/api/messenger/dispatch', 'messenger_dispatch_url');
--   select vault.create_secret('<same value as MESSENGER_DISPATCH_SECRET>', 'messenger_dispatch_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ── Linking ───────────────────────────────────────────────────────────

create table if not exists messenger_subscriptions (
  profile_id uuid primary key references profiles(id) on delete cascade,
  psid text not null unique,
  linked_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  opted_out_at timestamptz
);

alter table messenger_subscriptions enable row level security;

drop policy if exists "client read own messenger_subscription" on messenger_subscriptions;
create policy "client read own messenger_subscription" on messenger_subscriptions for select
  using (profile_id = auth.uid());

drop policy if exists "client delete own messenger_subscription" on messenger_subscriptions;
create policy "client delete own messenger_subscription" on messenger_subscriptions for delete
  using (profile_id = auth.uid());

create table if not exists messenger_link_tokens (
  token text primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Server (service role) only — no policies.
alter table messenger_link_tokens enable row level security;

-- ── Outbox ────────────────────────────────────────────────────────────

create table if not exists messenger_outbox (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'appointment_update', 'promo', 'booking_invite')),
  appointment_id uuid references appointments(id) on delete cascade,
  promo_id uuid references branch_promotions(id) on delete set null,
  broadcast_id uuid references notification_broadcasts(id) on delete set null,
  update_type text check (update_type in ('rescheduled', 'cancelled', 'no_show')),
  remind_for timestamptz,
  custom_text text,
  link_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint messenger_outbox_update_type_matches_kind
    check ((kind = 'appointment_update') = (update_type is not null)),
  constraint messenger_outbox_reminder_has_time
    check (kind <> 'reminder' or (appointment_id is not null and remind_for is not null))
);

-- One reminder per appointment per scheduled time: a reschedule gets a
-- fresh reminder for the new time.
create unique index if not exists messenger_outbox_one_reminder
  on messenger_outbox (appointment_id, remind_for) where kind = 'reminder';

create index if not exists messenger_outbox_due
  on messenger_outbox (next_attempt_at) where status = 'pending';

create index if not exists messenger_outbox_broadcast
  on messenger_outbox (broadcast_id) where broadcast_id is not null;

alter table messenger_outbox enable row level security;

drop policy if exists "admin read messenger_outbox" on messenger_outbox;
create policy "admin read messenger_outbox" on messenger_outbox for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create or replace view messenger_broadcast_results
with (security_invoker = true) as
select
  broadcast_id,
  count(*) filter (where status = 'sent')::int as sent,
  count(*) filter (where status = 'skipped')::int as skipped,
  count(*) filter (where status = 'failed')::int as failed,
  count(*) filter (where status in ('pending', 'sending'))::int as pending
from messenger_outbox
where broadcast_id is not null
group by broadcast_id;

create table if not exists messenger_dispatch_runs (
  id boolean primary key default true,
  last_run_at timestamptz,
  last_sent integer not null default 0,
  last_failed integer not null default 0,
  constraint messenger_dispatch_runs_singleton check (id)
);
insert into messenger_dispatch_runs (id) values (true) on conflict (id) do nothing;

alter table messenger_dispatch_runs enable row level security;

drop policy if exists "admin read messenger_dispatch_runs" on messenger_dispatch_runs;
create policy "admin read messenger_dispatch_runs" on messenger_dispatch_runs for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── Broadcast channels ────────────────────────────────────────────────

alter table notification_broadcasts add column if not exists channels text[] not null default '{email}';
alter table notification_broadcasts add column if not exists promo_id uuid references branch_promotions(id) on delete set null;

-- ── Clients can read the history of their own appointments ────────────

drop policy if exists "client read own appointment_history" on appointment_history;
create policy "client read own appointment_history" on appointment_history for select
  using (exists (
    select 1 from appointments a where a.id = appointment_history.appointment_id and a.client_id = auth.uid()
  ));

-- ── Appointment update trigger ────────────────────────────────────────

create or replace function enqueue_messenger_appointment_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
  v_type text;
begin
  if new.event_type = 'reschedule' then
    v_type := 'rescheduled';
  elsif new.event_type = 'status_change' and new.to_value = 'cancelled' then
    v_type := 'cancelled';
  elsif new.event_type = 'status_change' and new.to_value = 'no_show' then
    v_type := 'no_show';
  else
    return new;
  end if;

  select client_id into v_client from appointments where id = new.appointment_id;

  -- Walk-ins without an account, and changes the client made themselves.
  if v_client is null or new.changed_by is not distinct from v_client then
    return new;
  end if;

  if not exists (
    select 1 from messenger_subscriptions s where s.profile_id = v_client and s.opted_out_at is null
  ) then
    return new;
  end if;

  -- status and session_status can both flip to no_show in one update,
  -- producing two history rows; send one message.
  if exists (
    select 1 from messenger_outbox o
    where o.appointment_id = new.appointment_id
      and o.kind = 'appointment_update'
      and o.update_type = v_type
      and o.created_at > now() - interval '5 minutes'
  ) then
    return new;
  end if;

  insert into messenger_outbox (profile_id, kind, appointment_id, update_type, link_path)
  values (v_client, 'appointment_update', new.appointment_id, v_type,
          '/my-glow/appointments/' || new.appointment_id);

  return new;
exception when others then
  -- Never block a Front Desk / Admin appointment change over a notification.
  raise warning 'enqueue_messenger_appointment_update failed: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function enqueue_messenger_appointment_update() from public, anon, authenticated;

drop trigger if exists appointment_history_messenger_trigger on appointment_history;
create trigger appointment_history_messenger_trigger
  after insert on appointment_history
  for each row execute function enqueue_messenger_appointment_update();

-- ── Reminder job ──────────────────────────────────────────────────────

create or replace function enqueue_messenger_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into messenger_outbox (profile_id, kind, appointment_id, remind_for, link_path)
  select
    a.client_id,
    'reminder',
    a.id,
    (a.scheduled_date + a.start_time) at time zone 'Asia/Manila',
    '/my-glow/appointments/' || a.id
  from appointments a
  join messenger_subscriptions s on s.profile_id = a.client_id and s.opted_out_at is null
  where a.client_id is not null
    and (a.scheduled_date + a.start_time) at time zone 'Asia/Manila'
        between now() + interval '23 hours' and now() + interval '24 hours'
    and a.status not in ('cancelled', 'no_show', 'completed')
    and coalesce(a.session_status, '') not in ('completed', 'paid', 'no_show')
  on conflict do nothing;

  get diagnostics v_count = row_count;

  delete from messenger_link_tokens where expires_at < now() - interval '1 day';

  return v_count;
end;
$$;

revoke execute on function enqueue_messenger_reminders() from public, anon, authenticated;

-- ── Claiming work for the dispatcher ──────────────────────────────────

create or replace function claim_messenger_outbox(p_limit integer)
returns setof messenger_outbox
language plpgsql security definer set search_path = public as $$
begin
  -- A dispatcher that died mid-batch leaves rows in 'sending'.
  update messenger_outbox
     set status = 'pending'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';

  return query
  update messenger_outbox o
     set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
   where o.id in (
     select id from messenger_outbox
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at
      for update skip locked
      limit p_limit
   )
  returning o.*;
end;
$$;

revoke execute on function claim_messenger_outbox(integer) from public, anon, authenticated;

-- ── Dispatcher ping ───────────────────────────────────────────────────

create or replace function messenger_ping_dispatcher() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from messenger_outbox
     where (status = 'pending' and next_attempt_at <= now())
        or (status = 'sending' and claimed_at < now() - interval '10 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'messenger_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'messenger_dispatch_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function messenger_ping_dispatcher() from public, anon, authenticated;

select cron.schedule('messenger-reminders', '*/15 * * * *', $$select public.enqueue_messenger_reminders()$$);
select cron.schedule('messenger-dispatch', '* * * * *', $$select public.messenger_ping_dispatcher()$$);
```

- [ ] **Step 2: Apply it**

Supabase Dashboard → SQL Editor → paste the whole file → Run.
Expected: "Success. No rows returned" (the two `cron.schedule` selects return job ids).

- [ ] **Step 3: Verify structure and permissions**

Run in the SQL Editor:

```sql
select jobname, schedule from cron.job where jobname like 'messenger-%';
select count(*) from messenger_dispatch_runs;
select has_function_privilege('anon', 'claim_messenger_outbox(integer)', 'execute') as anon_can_claim,
       has_function_privilege('authenticated', 'claim_messenger_outbox(integer)', 'execute') as auth_can_claim;
```

Expected: two jobs (`*/15 * * * *`, `* * * * *`); `1`; `false`, `false`.

- [ ] **Step 4: Verify trigger behaviour (Review Focus 1 & 3) in a rolled-back transaction**

Pick a real customer id and one of their appointments, then run:

```sql
begin;
insert into messenger_subscriptions (profile_id, psid) values ('<CUSTOMER_ID>', 'test-psid-1');
-- Simulate staff marking no-show on both columns at once.
update appointments set status = 'no_show', session_status = 'no_show' where id = '<APPOINTMENT_ID>';
select kind, update_type, link_path from messenger_outbox where appointment_id = '<APPOINTMENT_ID>';
-- Simulate a reschedule.
update appointments set scheduled_date = scheduled_date + 1 where id = '<APPOINTMENT_ID>';
select kind, update_type from messenger_outbox where appointment_id = '<APPOINTMENT_ID>' order by created_at;
rollback;
```

Expected: after the first update exactly **one** row `appointment_update | no_show | /my-glow/appointments/<id>`; after the reschedule a second row `appointment_update | rescheduled`. The `update` statements succeed.

Then check the failure path does not block writes:

```sql
begin;
insert into messenger_subscriptions (profile_id, psid) values ('<CUSTOMER_ID>', 'test-psid-1');
alter table messenger_outbox add constraint tmp_block check (false) not valid;
update appointments set status = 'cancelled' where id = '<APPOINTMENT_ID>';
select status from appointments where id = '<APPOINTMENT_ID>';
rollback;
```

Expected: the update succeeds (a `WARNING: enqueue_messenger_appointment_update failed` is shown) and status reads `cancelled`.

- [ ] **Step 5: Verify reminders (Review Focus 2)**

```sql
begin;
insert into messenger_subscriptions (profile_id, psid) values ('<CUSTOMER_ID>', 'test-psid-1');
-- Move the appointment to ~23.5h from now (Manila time).
update appointments
   set scheduled_date = ((now() + interval '23 hours 30 minutes') at time zone 'Asia/Manila')::date,
       start_time     = ((now() + interval '23 hours 30 minutes') at time zone 'Asia/Manila')::time,
       status = 'confirmed', session_status = null
 where id = '<APPOINTMENT_ID>';
select enqueue_messenger_reminders();  -- expect 1
select enqueue_messenger_reminders();  -- expect 0 (deduped)
update appointments set scheduled_date = scheduled_date + 2 where id = '<APPOINTMENT_ID>';
update appointments set scheduled_date = scheduled_date - 2 where id = '<APPOINTMENT_ID>';
select enqueue_messenger_reminders();  -- expect 0 (same time again)
rollback;
```

Expected: `1`, `0`, `0`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/047_messenger.sql
git commit -m "feat: Messenger subscriptions, outbox, update trigger, and cron jobs (047)"
```

---

### Task 4: Shared appointment formatting, utility templates, and message builders

**Files:**
- Create: `src/lib/appointmentFormat.ts`, `src/lib/appointmentFormat.test.ts`, `src/lib/messenger/templates.ts`, `src/lib/messenger/messages.ts`, `src/lib/messenger/messages.test.ts`

**Interfaces:**
- Produces:
  - `formatAppointmentDate(date: string): string` — `"2026-10-07"` → `"Wed, Oct 7"`
  - `formatAppointmentTime(time: string): string` — `"14:30:00"` → `"2:30 PM"`
  - `humanizeStatus(value: string): string` — `"no_show"` → `"No show"`
  - `appointmentStatusStyles: Record<string, string>`
  - `describeHistoryEvent(e: { eventType: string; fromValue: string | null; toValue: string | null }): string`
  - `type AppointmentTemplateKind = "reminder" | "rescheduled" | "cancelled" | "no_show"`
  - `APPOINTMENT_TEMPLATES: Record<AppointmentTemplateKind, { name: string; body: string; example: string[] }>`
  - `templateCreatePayload(kind: AppointmentTemplateKind, siteUrl: string): Record<string, unknown>`
  - `type AppointmentMessageData = { appointmentId: string; firstName: string; serviceName: string; branchName: string; scheduledDate: string; startTime: string }`
  - `appointmentTemplateParams(kind, data): string[]`
  - `buildAppointmentTemplateMessage(psid: string, kind: AppointmentTemplateKind, data: AppointmentMessageData)`
  - `buildButtonMessage(psid: string, text: string, buttonTitle: string, url: string, messagingType: "RESPONSE" | "UPDATE")`
  - `buildTextMessage(psid: string, text: string)`
  - `BUTTON_TEXT_LIMIT = 640`

- [ ] **Step 1: Write failing tests**

`src/lib/appointmentFormat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  describeHistoryEvent,
  formatAppointmentDate,
  formatAppointmentTime,
  humanizeStatus,
} from "./appointmentFormat";

describe("appointment formatting", () => {
  it("formats dates without timezone drift", () => {
    expect(formatAppointmentDate("2026-10-07")).toBe("Wed, Oct 7");
    expect(formatAppointmentDate("2026-01-01")).toBe("Thu, Jan 1");
  });

  it("formats times as 12-hour", () => {
    expect(formatAppointmentTime("14:30:00")).toBe("2:30 PM");
    expect(formatAppointmentTime("00:05")).toBe("12:05 AM");
    expect(formatAppointmentTime("12:00:00")).toBe("12:00 PM");
  });

  it("humanizes statuses", () => {
    expect(humanizeStatus("no_show")).toBe("No show");
    expect(humanizeStatus("reschedule_requested")).toBe("Reschedule requested");
  });

  it("describes history events", () => {
    expect(describeHistoryEvent({ eventType: "created", fromValue: null, toValue: "pending" })).toBe("Booked");
    expect(
      describeHistoryEvent({ eventType: "reschedule", fromValue: "2026-10-07 14:30:00", toValue: "2026-10-09 10:00:00" })
    ).toBe("Rescheduled from Wed, Oct 7 · 2:30 PM to Fri, Oct 9 · 10:00 AM");
    expect(describeHistoryEvent({ eventType: "status_change", fromValue: "confirmed", toValue: "no_show" })).toBe(
      "Marked as No show"
    );
  });
});
```

`src/lib/messenger/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BUTTON_TEXT_LIMIT,
  appointmentTemplateParams,
  buildAppointmentTemplateMessage,
  buildButtonMessage,
} from "./messages";
import { APPOINTMENT_TEMPLATES, templateCreatePayload } from "./templates";

const data = {
  appointmentId: "appt-1",
  firstName: "Ana",
  serviceName: "Signature Facial",
  branchName: "Robinsons",
  scheduledDate: "2026-10-07",
  startTime: "14:30:00",
};

describe("appointment template messages", () => {
  it("builds a utility template send payload", () => {
    expect(buildAppointmentTemplateMessage("psid-1", "reminder", data)).toEqual({
      recipient: { id: "psid-1" },
      messaging_type: "UTILITY",
      message: {
        template: {
          name: "glowsync_appt_reminder",
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: ["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7", "2:30 PM"].map((text) => ({
                type: "text",
                text,
              })),
            },
            { type: "buttons", parameters: [{ type: "URL", url: "appt-1" }] },
          ],
        },
      },
    });
  });

  it("uses four parameters for cancelled and no-show", () => {
    expect(appointmentTemplateParams("cancelled", data)).toEqual(["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7"]);
    expect(appointmentTemplateParams("no_show", data)).toHaveLength(4);
  });

  it("never sends empty parameters (Review Focus 5)", () => {
    const params = appointmentTemplateParams("reminder", { ...data, firstName: " ", serviceName: "", branchName: "" });
    expect(params.slice(0, 3)).toEqual(["there", "appointment", "Blush Spa"]);
    expect(params.every((p) => p.trim().length > 0)).toBe(true);
  });

  it("parameter count matches each template body", () => {
    for (const kind of Object.keys(APPOINTMENT_TEMPLATES) as (keyof typeof APPOINTMENT_TEMPLATES)[]) {
      const placeholders = APPOINTMENT_TEMPLATES[kind].body.match(/\{\{\d+\}\}/g) ?? [];
      expect(appointmentTemplateParams(kind, data)).toHaveLength(placeholders.length);
      expect(APPOINTMENT_TEMPLATES[kind].example).toHaveLength(placeholders.length);
    }
  });

  it("builds a template create payload with the site URL", () => {
    const payload = templateCreatePayload("cancelled", "https://glow.example") as {
      category: string;
      components: { type: string; buttons?: { url: string }[] }[];
    };
    expect(payload.category).toBe("UTILITY");
    expect(payload.components[1].buttons?.[0].url).toBe("https://glow.example/my-glow/appointments/{{1}}");
  });
});

describe("button messages", () => {
  it("builds a button template", () => {
    expect(buildButtonMessage("psid-1", "New promo!", "View promo", "https://glow.example/promos/p1", "UPDATE")).toEqual({
      recipient: { id: "psid-1" },
      messaging_type: "UPDATE",
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "New promo!",
            buttons: [{ type: "web_url", url: "https://glow.example/promos/p1", title: "View promo" }],
          },
        },
      },
    });
  });

  it("truncates text over the 640-character limit (Review Focus 4)", () => {
    const msg = buildButtonMessage("p", "x".repeat(1000), "Book now", "https://g.example/", "UPDATE") as {
      message: { attachment: { payload: { text: string } } };
    };
    const text = msg.message.attachment.payload.text;
    expect(text).toHaveLength(BUTTON_TEXT_LIMIT);
    expect(text.endsWith("…")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/appointmentFormat.ts`**

```ts
// Shared by the client appointment page, My Bookings, and Messenger
// messages. Dates/times are Manila-local strings from Postgres
// ("2026-10-07", "14:30:00") and are formatted as-is, never converted.

export function formatAppointmentDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatAppointmentTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

export function humanizeStatus(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const appointmentStatusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-ink/10 text-ink/50",
  no_show: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

function formatDateTime(value: string | null): string {
  if (!value) return "an earlier time";
  const [date, time] = value.split(" ");
  return time ? `${formatAppointmentDate(date)} · ${formatAppointmentTime(time)}` : formatAppointmentDate(date);
}

export function describeHistoryEvent(e: { eventType: string; fromValue: string | null; toValue: string | null }): string {
  if (e.eventType === "created") return "Booked";
  if (e.eventType === "reschedule") {
    return `Rescheduled from ${formatDateTime(e.fromValue)} to ${formatDateTime(e.toValue)}`;
  }
  return `Marked as ${humanizeStatus(e.toValue ?? "updated")}`;
}
```

- [ ] **Step 4: Implement `src/lib/messenger/templates.ts`**

This file must have **no imports** and only erasable TypeScript syntax — `scripts/messenger-setup.ts` runs it directly under Node.

```ts
// Messenger utility templates for appointment messages. Created on the
// Page by scripts/messenger-setup.ts. Bodies must not start or end with
// a parameter and must not contain marketing content (Meta policy).

export type AppointmentTemplateKind = "reminder" | "rescheduled" | "cancelled" | "no_show";

export const APPOINTMENT_TEMPLATES: Record<
  AppointmentTemplateKind,
  { name: string; body: string; example: string[] }
> = {
  reminder: {
    name: "glowsync_appt_reminder",
    body: "Hi {{1}}, this is a reminder of your {{2}} at {{3}} on {{4}} at {{5}}. See you soon!",
    example: ["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7", "2:30 PM"],
  },
  rescheduled: {
    name: "glowsync_appt_rescheduled",
    body: "Hi {{1}}, your {{2}} at {{3}} has been moved to {{4}} at {{5}}. Tap below for details.",
    example: ["Ana", "Signature Facial", "Robinsons", "Fri, Oct 9", "10:00 AM"],
  },
  cancelled: {
    name: "glowsync_appt_cancelled",
    body: "Hi {{1}}, your {{2}} at {{3}} on {{4}} has been cancelled. Tap below for details.",
    example: ["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7"],
  },
  no_show: {
    name: "glowsync_appt_no_show",
    body: "Hi {{1}}, we missed you for your {{2}} at {{3}} on {{4}}. Tap below to see your options.",
    example: ["Ana", "Signature Facial", "Robinsons", "Wed, Oct 7"],
  },
};

export const APPOINTMENT_BUTTON_TEXT = "View appointment";

export function templateCreatePayload(kind: AppointmentTemplateKind, siteUrl: string): Record<string, unknown> {
  const t = APPOINTMENT_TEMPLATES[kind];
  const base = siteUrl.replace(/\/+$/, "");
  return {
    name: t.name,
    language: "en",
    category: "UTILITY",
    components: [
      { type: "BODY", text: t.body, example: { body_text: [t.example] } },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: APPOINTMENT_BUTTON_TEXT,
            url: `${base}/my-glow/appointments/{{1}}`,
            example: { url_suffix_example: `${base}/my-glow/appointments/00000000-0000-0000-0000-000000000000` },
          },
        ],
      },
    ],
  };
}
```

- [ ] **Step 5: Implement `src/lib/messenger/messages.ts`**

```ts
import { formatAppointmentDate, formatAppointmentTime } from "@/lib/appointmentFormat";
import { APPOINTMENT_TEMPLATES, type AppointmentTemplateKind } from "./templates";

export const BUTTON_TEXT_LIMIT = 640;

export type AppointmentMessageData = {
  appointmentId: string;
  firstName: string;
  serviceName: string;
  branchName: string;
  scheduledDate: string;
  startTime: string;
};

// Graph rejects empty template parameters.
function orDefault(value: string, fallback: string): string {
  return value.trim() ? value.trim() : fallback;
}

export function appointmentTemplateParams(kind: AppointmentTemplateKind, data: AppointmentMessageData): string[] {
  const common = [
    orDefault(data.firstName, "there"),
    orDefault(data.serviceName, "appointment"),
    orDefault(data.branchName, "Blush Spa"),
    formatAppointmentDate(data.scheduledDate),
  ];
  return kind === "reminder" || kind === "rescheduled" ? [...common, formatAppointmentTime(data.startTime)] : common;
}

export function buildAppointmentTemplateMessage(psid: string, kind: AppointmentTemplateKind, data: AppointmentMessageData) {
  return {
    recipient: { id: psid },
    messaging_type: "UTILITY",
    message: {
      template: {
        name: APPOINTMENT_TEMPLATES[kind].name,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: appointmentTemplateParams(kind, data).map((text) => ({ type: "text", text })),
          },
          { type: "buttons", parameters: [{ type: "URL", url: data.appointmentId }] },
        ],
      },
    },
  };
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function buildButtonMessage(
  psid: string,
  text: string,
  buttonTitle: string,
  url: string,
  messagingType: "RESPONSE" | "UPDATE"
) {
  return {
    recipient: { id: psid },
    messaging_type: messagingType,
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: truncate(text, BUTTON_TEXT_LIMIT),
          buttons: [{ type: "web_url", url, title: buttonTitle }],
        },
      },
    },
  };
}

export function buildTextMessage(psid: string, text: string) {
  return { recipient: { id: psid }, messaging_type: "RESPONSE", message: { text } };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. If the `formatAppointmentDate` expectations disagree on weekday, check against a calendar (2026-10-07 is a Wednesday) before changing code.

- [ ] **Step 7: Commit**

```bash
git add src/lib/appointmentFormat.ts src/lib/appointmentFormat.test.ts src/lib/messenger/templates.ts src/lib/messenger/messages.ts src/lib/messenger/messages.test.ts
git commit -m "feat: Messenger utility templates and message builders"
```

---

### Task 5: Messenger config, webhook signature/events, error classification, skip rules

**Files:**
- Create: `src/lib/messenger/config.ts`, `config.test.ts`, `signature.ts`, `signature.test.ts`, `webhookEvents.ts`, `webhookEvents.test.ts`, `errors.ts`, `errors.test.ts`, `dispatchRules.ts`, `dispatchRules.test.ts` (all under `src/lib/messenger/`)

**Interfaces:**
- Produces:
  - `GRAPH_VERSION = "v23.0"`; `type MessengerConfig = { pageId; pageAccessToken; appSecret; verifyToken; dispatchSecret; pageUsername; siteUrl }` (all `string`, `siteUrl` without trailing slash)
  - `missingMessengerEnv(env?: Record<string, string | undefined>): string[]`; `getMessengerConfig(env?): MessengerConfig | null`
  - `safeEqual(a: string, b: string): boolean`; `verifySignature(rawBody: Buffer | string, header: string | null, appSecret: string): boolean`
  - `type MessagingEvent`; `type WebhookAction = { type: "link"; psid: string; ref: string } | { type: "stop"; psid: string } | { type: "start"; psid: string } | { type: "inbound"; psid: string } | { type: "ignore" }`; `parseMessagingEvent(e: MessagingEvent): WebhookAction`
  - `type SendOutcome = { kind: "sent" } | { kind: "retry" | "fail" | "fail_opt_out"; error: string }`; `classifyGraphResponse(status: number, body: unknown): SendOutcome`; `MAX_ATTEMPTS = 5`; `retryDelayMinutes(attempts: number): number | null`
  - `type OutboxKind = "reminder" | "appointment_update" | "promo" | "booking_invite"`; `type SkipContext`; `skipReason(ctx: SkipContext): string | null`; `manilaScheduledAt(date: string, time: string): string` (ISO UTC)

- [ ] **Step 1: Write failing tests**

`src/lib/messenger/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getMessengerConfig, missingMessengerEnv } from "./config";

const full = {
  MESSENGER_PAGE_ID: "123",
  MESSENGER_PAGE_ACCESS_TOKEN: "tok",
  MESSENGER_APP_SECRET: "sec",
  MESSENGER_VERIFY_TOKEN: "ver",
  MESSENGER_DISPATCH_SECRET: "dis",
  NEXT_PUBLIC_MESSENGER_PAGE_USERNAME: "blushspa",
  NEXT_PUBLIC_SITE_URL: "https://glow.example/",
};

describe("messenger config", () => {
  it("returns config with trailing slash trimmed", () => {
    expect(getMessengerConfig(full)?.siteUrl).toBe("https://glow.example");
    expect(missingMessengerEnv(full)).toEqual([]);
  });

  it("reports missing vars and returns null", () => {
    const env = { ...full, MESSENGER_APP_SECRET: "", MESSENGER_PAGE_ID: undefined };
    expect(missingMessengerEnv(env)).toEqual(["MESSENGER_PAGE_ID", "MESSENGER_APP_SECRET"]);
    expect(getMessengerConfig(env)).toBeNull();
  });
});
```

`src/lib/messenger/signature.test.ts`:

```ts
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeEqual, verifySignature } from "./signature";

const body = '{"object":"page","entry":[]}';
const sign = (b: string, secret: string) => "sha256=" + createHmac("sha256", secret).update(b).digest("hex");

describe("verifySignature", () => {
  it("accepts a valid signature (string and Buffer bodies)", () => {
    expect(verifySignature(body, sign(body, "s3cret"), "s3cret")).toBe(true);
    expect(verifySignature(Buffer.from(body), sign(body, "s3cret"), "s3cret")).toBe(true);
  });

  it("rejects tampered body, wrong secret, missing or malformed header", () => {
    expect(verifySignature(body + " ", sign(body, "s3cret"), "s3cret")).toBe(false);
    expect(verifySignature(body, sign(body, "other"), "s3cret")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, "sha1=abc", "s3cret")).toBe(false);
  });

  it("safeEqual handles different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
```

`src/lib/messenger/webhookEvents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMessagingEvent } from "./webhookEvents";

describe("parseMessagingEvent", () => {
  it("links from an existing-thread referral", () => {
    expect(parseMessagingEvent({ sender: { id: "u1" }, referral: { ref: "tok" } })).toEqual({
      type: "link",
      psid: "u1",
      ref: "tok",
    });
  });

  it("links from a Get Started postback referral", () => {
    expect(
      parseMessagingEvent({ sender: { id: "u1" }, postback: { payload: "GET_STARTED", referral: { ref: "tok" } } })
    ).toEqual({ type: "link", psid: "u1", ref: "tok" });
  });

  it("handles STOP and START case-insensitively", () => {
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: "  stop " } })).toEqual({ type: "stop", psid: "u1" });
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: "Start" } })).toEqual({ type: "start", psid: "u1" });
  });

  it("treats other messages and postbacks as inbound", () => {
    expect(parseMessagingEvent({ sender: { id: "u1" }, message: { text: "hello" } })).toEqual({ type: "inbound", psid: "u1" });
    expect(parseMessagingEvent({ sender: { id: "u1" }, postback: { payload: "X" } })).toEqual({ type: "inbound", psid: "u1" });
  });

  it("ignores echoes, missing senders, and delivery/read events", () => {
    expect(parseMessagingEvent({ sender: { id: "page" }, message: { text: "hi", is_echo: true } })).toEqual({ type: "ignore" });
    expect(parseMessagingEvent({ message: { text: "hi" } })).toEqual({ type: "ignore" });
    expect(parseMessagingEvent({ sender: { id: "u1" } })).toEqual({ type: "ignore" });
  });
});
```

`src/lib/messenger/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyGraphResponse, retryDelayMinutes } from "./errors";

const err = (code: number, error_subcode?: number) => ({ error: { message: `e${code}`, code, error_subcode } });

describe("classifyGraphResponse", () => {
  it("2xx is sent", () => expect(classifyGraphResponse(200, { message_id: "m" })).toEqual({ kind: "sent" }));

  it("unreachable/blocked users fail and opt out", () => {
    expect(classifyGraphResponse(400, err(551)).kind).toBe("fail_opt_out");
    expect(classifyGraphResponse(403, err(200, 1545041)).kind).toBe("fail_opt_out");
    expect(classifyGraphResponse(400, err(100, 2018001)).kind).toBe("fail_opt_out");
  });

  it("rate limits, temporary errors and 5xx retry", () => {
    expect(classifyGraphResponse(400, err(613)).kind).toBe("retry");
    expect(classifyGraphResponse(400, err(1200)).kind).toBe("retry");
    expect(classifyGraphResponse(429, null).kind).toBe("retry");
    expect(classifyGraphResponse(503, null).kind).toBe("retry");
  });

  it("other client errors fail with the Graph message", () => {
    expect(classifyGraphResponse(400, err(100))).toEqual({ kind: "fail", error: "e100" });
    expect(classifyGraphResponse(400, err(10, 2018278)).kind).toBe("fail");
  });
});

describe("retryDelayMinutes", () => {
  it("backs off 1/5/15/60 then gives up after 5 attempts", () => {
    expect([1, 2, 3, 4].map(retryDelayMinutes)).toEqual([1, 5, 15, 60]);
    expect(retryDelayMinutes(5)).toBeNull();
  });
});
```

`src/lib/messenger/dispatchRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { manilaScheduledAt, skipReason, type SkipContext } from "./dispatchRules";

const now = new Date("2026-10-06T06:00:00Z");
const sub = { optedOutAt: null, lastInboundAt: "2026-10-06T01:00:00Z" };
const appt = { status: "confirmed", sessionStatus: null, scheduledAt: "2026-10-07T06:30:00.000Z" };
const ctx = (o: Partial<SkipContext>): SkipContext => ({
  kind: "reminder",
  subscription: sub,
  appointment: appt,
  remindFor: appt.scheduledAt,
  now,
  ...o,
});

describe("manilaScheduledAt", () => {
  it("interprets date+time as UTC+8", () => {
    expect(manilaScheduledAt("2026-10-07", "14:30:00")).toBe("2026-10-07T06:30:00.000Z");
    expect(manilaScheduledAt("2026-10-07", "14:30")).toBe("2026-10-07T06:30:00.000Z");
  });
});

describe("skipReason", () => {
  it("sends an eligible reminder", () => expect(skipReason(ctx({}))).toBeNull());

  it("skips when not subscribed or opted out", () => {
    expect(skipReason(ctx({ subscription: null }))).toBe("not_subscribed");
    expect(skipReason(ctx({ subscription: { ...sub, optedOutAt: "2026-10-01T00:00:00Z" } }))).toBe("opted_out");
  });

  it("skips reminders for inactive, moved, passed or missing appointments", () => {
    expect(skipReason(ctx({ appointment: null }))).toBe("appointment_missing");
    expect(skipReason(ctx({ appointment: { ...appt, status: "cancelled" } }))).toBe("appointment_inactive");
    expect(skipReason(ctx({ appointment: { ...appt, sessionStatus: "completed" } }))).toBe("appointment_inactive");
    expect(skipReason(ctx({ remindFor: "2026-10-05T06:30:00.000Z" }))).toBe("appointment_moved");
    expect(skipReason(ctx({ now: new Date("2026-10-07T07:00:00Z") }))).toBe("appointment_passed");
  });

  it("sends appointment updates even when the appointment is cancelled", () => {
    expect(skipReason(ctx({ kind: "appointment_update", appointment: { ...appt, status: "cancelled" }, remindFor: null }))).toBeNull();
  });

  it("enforces the 24h window for promos and invites", () => {
    const promo = { appointment: null, remindFor: null };
    expect(skipReason(ctx({ kind: "promo", ...promo }))).toBeNull();
    expect(skipReason(ctx({ kind: "booking_invite", ...promo, subscription: { ...sub, lastInboundAt: null } }))).toBe(
      "outside_24h_window"
    );
    expect(
      skipReason(ctx({ kind: "promo", ...promo, subscription: { ...sub, lastInboundAt: "2026-10-05T05:59:00Z" } }))
    ).toBe("outside_24h_window");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — five modules not found.

- [ ] **Step 3: Implement the modules**

`src/lib/messenger/config.ts`:

```ts
export const GRAPH_VERSION = "v23.0";

export type MessengerConfig = {
  pageId: string;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
  dispatchSecret: string;
  pageUsername: string;
  siteUrl: string;
};

const ENV_KEYS: Record<keyof MessengerConfig, string> = {
  pageId: "MESSENGER_PAGE_ID",
  pageAccessToken: "MESSENGER_PAGE_ACCESS_TOKEN",
  appSecret: "MESSENGER_APP_SECRET",
  verifyToken: "MESSENGER_VERIFY_TOKEN",
  dispatchSecret: "MESSENGER_DISPATCH_SECRET",
  pageUsername: "NEXT_PUBLIC_MESSENGER_PAGE_USERNAME",
  siteUrl: "NEXT_PUBLIC_SITE_URL",
};

type Env = Record<string, string | undefined>;

export function missingMessengerEnv(env: Env = process.env): string[] {
  return Object.values(ENV_KEYS).filter((key) => !env[key]?.trim());
}

// Server-only: returns null unless every Messenger env var is set.
export function getMessengerConfig(env: Env = process.env): MessengerConfig | null {
  if (missingMessengerEnv(env).length > 0) return null;
  const read = (k: keyof MessengerConfig) => env[ENV_KEYS[k]]!.trim();
  return {
    pageId: read("pageId"),
    pageAccessToken: read("pageAccessToken"),
    appSecret: read("appSecret"),
    verifyToken: read("verifyToken"),
    dispatchSecret: read("dispatchSecret"),
    pageUsername: read("pageUsername"),
    siteUrl: read("siteUrl").replace(/\/+$/, ""),
  };
}
```

`src/lib/messenger/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Meta signs the raw request body: X-Hub-Signature-256: sha256=<hex HMAC>.
export function verifySignature(rawBody: Buffer | string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return safeEqual(header, expected);
}
```

`src/lib/messenger/webhookEvents.ts`:

```ts
export type MessagingEvent = {
  sender?: { id?: string };
  message?: { text?: string; is_echo?: boolean };
  postback?: { payload?: string; referral?: { ref?: string } };
  referral?: { ref?: string };
};

export type WebhookAction =
  | { type: "link"; psid: string; ref: string }
  | { type: "stop"; psid: string }
  | { type: "start"; psid: string }
  | { type: "inbound"; psid: string }
  | { type: "ignore" };

export function parseMessagingEvent(e: MessagingEvent): WebhookAction {
  const psid = e.sender?.id;
  if (!psid || e.message?.is_echo) return { type: "ignore" };

  // New threads deliver the m.me ref on the Get Started postback;
  // existing threads deliver it as a standalone referral event.
  const ref = e.referral?.ref ?? e.postback?.referral?.ref;
  if (ref) return { type: "link", psid, ref };

  const text = e.message?.text?.trim().toUpperCase();
  if (text === "STOP") return { type: "stop", psid };
  if (text === "START") return { type: "start", psid };

  if (e.message || e.postback) return { type: "inbound", psid };
  return { type: "ignore" };
}
```

`src/lib/messenger/errors.ts`:

```ts
export type SendOutcome = { kind: "sent" } | { kind: "retry" | "fail" | "fail_opt_out"; error: string };

type GraphError = { message?: string; code?: number; error_subcode?: number };

// Graph Send API error codes. Confirm against current Meta docs if
// Meta changes them; this is the only place they live.
const RETRY_CODES = new Set([1200, 4, 17, 32, 613]);

export function classifyGraphResponse(status: number, body: unknown): SendOutcome {
  if (status >= 200 && status < 300) return { kind: "sent" };

  const err: GraphError = (body as { error?: GraphError } | null)?.error ?? {};
  const error = err.message ?? `HTTP ${status}`;
  const { code, error_subcode: sub } = err;

  if (code === 551 || (code === 200 && sub === 1545041) || (code === 100 && sub === 2018001)) {
    return { kind: "fail_opt_out", error };
  }
  if (status >= 500 || status === 429 || (code !== undefined && RETRY_CODES.has(code))) {
    return { kind: "retry", error };
  }
  return { kind: "fail", error };
}

export const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60];

// `attempts` already includes the attempt that just failed.
export function retryDelayMinutes(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return BACKOFF_MINUTES[Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1];
}
```

`src/lib/messenger/dispatchRules.ts`:

```ts
export type OutboxKind = "reminder" | "appointment_update" | "promo" | "booking_invite";

export type SkipContext = {
  kind: OutboxKind;
  subscription: { optedOutAt: string | null; lastInboundAt: string | null } | null;
  appointment: { status: string; sessionStatus: string | null; scheduledAt: string } | null;
  remindFor: string | null;
  now: Date;
};

const WINDOW_MS = 24 * 60 * 60 * 1000;
const INACTIVE_STATUSES = new Set(["cancelled", "no_show", "completed"]);
const INACTIVE_SESSION = new Set(["completed", "paid", "no_show"]);

// Manila is UTC+8 with no DST.
export function manilaScheduledAt(date: string, time: string): string {
  const hhmmss = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return new Date(`${date.slice(0, 10)}T${hhmmss}+08:00`).toISOString();
}

export function skipReason(ctx: SkipContext): string | null {
  if (!ctx.subscription) return "not_subscribed";
  if (ctx.subscription.optedOutAt) return "opted_out";

  if (ctx.kind === "reminder" || ctx.kind === "appointment_update") {
    if (!ctx.appointment) return "appointment_missing";
  }

  if (ctx.kind === "reminder" && ctx.appointment) {
    const a = ctx.appointment;
    if (INACTIVE_STATUSES.has(a.status) || INACTIVE_SESSION.has(a.sessionStatus ?? "")) return "appointment_inactive";
    if (ctx.remindFor && Date.parse(ctx.remindFor) !== Date.parse(a.scheduledAt)) return "appointment_moved";
    if (Date.parse(a.scheduledAt) <= ctx.now.getTime()) return "appointment_passed";
  }

  if (ctx.kind === "promo" || ctx.kind === "booking_invite") {
    const last = ctx.subscription.lastInboundAt;
    if (!last || ctx.now.getTime() - Date.parse(last) > WINDOW_MS) return "outside_24h_window";
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messenger
git commit -m "feat: Messenger config, webhook parsing, error classification, and skip rules"
```

---

### Task 6: Graph client, link-token route, and webhook

**Files:**
- Create: `src/lib/messenger/graph.ts`, `src/lib/supabase/queries/messenger.ts`, `src/app/api/messenger/link-token/route.ts`, `src/app/api/messenger/webhook/route.ts`

**Interfaces:**
- Consumes: `getMessengerConfig`, `verifySignature`, `safeEqual`, `parseMessagingEvent`, `buildButtonMessage`, `buildTextMessage`, `createAdminClient`.
- Produces:
  - `sendToGraph(config: MessengerConfig, payload: unknown): Promise<{ status: number; body: unknown }>`
  - `type MessengerStatus = "none" | "connected" | "paused"`; `getMyMessengerStatus(supabase: SupabaseClient, userId: string): Promise<MessengerStatus>`
  - `POST /api/messenger/link-token` → `200 { url }` | `401` | `403` | `503 { error }`
  - `GET/POST /api/messenger/webhook`

- [ ] **Step 1: `src/lib/messenger/graph.ts`**

```ts
import { GRAPH_VERSION, type MessengerConfig } from "./config";

export async function sendToGraph(config: MessengerConfig, payload: unknown): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.pageId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.pageAccessToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
```

- [ ] **Step 2: `src/lib/supabase/queries/messenger.ts` (client status only for now; Task 10 appends admin helpers)**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type MessengerStatus = "none" | "connected" | "paused";

export async function getMyMessengerStatus(supabase: SupabaseClient, userId: string): Promise<MessengerStatus> {
  const { data, error } = await supabase
    .from("messenger_subscriptions")
    .select("opted_out_at")
    .eq("profile_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getMyMessengerStatus failed:", error);
    return "none";
  }
  if (!data) return "none";
  return data.opted_out_at ? "paused" : "connected";
}
```

- [ ] **Step 3: `src/app/api/messenger/link-token/route.ts`**

```ts
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessengerConfig } from "@/lib/messenger/config";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export async function POST() {
  const config = getMessengerConfig();
  if (!config) {
    return NextResponse.json({ error: "Messenger isn't available right now." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (profile?.role !== "customer") {
    return NextResponse.json({ error: "Only client accounts can connect Messenger." }, { status: 403 });
  }

  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient()
    .from("messenger_link_tokens")
    .insert({ token, profile_id: auth.user.id, expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() });

  if (error) {
    console.error("Creating messenger link token failed:", error);
    return NextResponse.json({ error: "Couldn't start Messenger connect. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ url: `https://m.me/${encodeURIComponent(config.pageUsername)}?ref=${token}` });
}
```

- [ ] **Step 4: `src/app/api/messenger/webhook/route.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessengerConfig, type MessengerConfig } from "@/lib/messenger/config";
import { safeEqual, verifySignature } from "@/lib/messenger/signature";
import { parseMessagingEvent, type MessagingEvent } from "@/lib/messenger/webhookEvents";
import { sendToGraph } from "@/lib/messenger/graph";
import { buildButtonMessage, buildTextMessage } from "@/lib/messenger/messages";

type WebhookBody = {
  object?: string;
  entry?: { messaging?: MessagingEvent[]; changes?: unknown[] }[];
};

// Meta's subscription handshake.
export async function GET(request: Request) {
  const config = getMessengerConfig();
  const params = new URL(request.url).searchParams;
  if (
    config &&
    params.get("hub.mode") === "subscribe" &&
    safeEqual(params.get("hub.verify_token") ?? "", config.verifyToken)
  ) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const config = getMessengerConfig();
  if (!config) return new Response("Messenger not configured", { status: 503 });

  const raw = Buffer.from(await request.arrayBuffer());
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Always 200 after a valid signature: a non-200 makes Meta retry and
  // eventually disable the webhook.
  try {
    const body = JSON.parse(raw.toString("utf8")) as WebhookBody;
    const supabase = createAdminClient();
    for (const entry of body.entry ?? []) {
      if (entry.changes?.length) {
        console.info("Messenger webhook change:", JSON.stringify(entry.changes));
      }
      for (const event of entry.messaging ?? []) {
        try {
          await handleEvent(event, supabase, config);
        } catch (err) {
          console.error("Messenger webhook event failed:", err);
        }
      }
    }
  } catch (err) {
    console.error("Messenger webhook body invalid:", err);
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function reply(config: MessengerConfig, payload: unknown) {
  const res = await sendToGraph(config, payload);
  if (res.status >= 300) console.error("Messenger reply failed:", JSON.stringify(res.body));
}

async function handleEvent(event: MessagingEvent, supabase: SupabaseClient, config: MessengerConfig) {
  const action = parseMessagingEvent(event);
  if (action.type === "ignore") return;

  const now = new Date().toISOString();

  if (action.type === "link") {
    const { data: token } = await supabase
      .from("messenger_link_tokens")
      .update({ used_at: now })
      .eq("token", action.ref)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("profile_id")
      .maybeSingle();

    if (!token) {
      await reply(
        config,
        buildTextMessage(action.psid, "This link has expired — tap Connect Messenger in GlowSync again.")
      );
      return;
    }

    // A Messenger account belongs to one GlowSync client at a time.
    await supabase.from("messenger_subscriptions").delete().eq("psid", action.psid).neq("profile_id", token.profile_id);
    const { error } = await supabase.from("messenger_subscriptions").upsert(
      { profile_id: token.profile_id, psid: action.psid, linked_at: now, last_inbound_at: now, opted_out_at: null },
      { onConflict: "profile_id" }
    );
    if (error) throw error;

    await reply(
      config,
      buildButtonMessage(
        action.psid,
        "You're connected to GlowSync ✨ We'll send your appointment reminders and updates here.",
        "Open My Glow",
        `${config.siteUrl}/my-glow`,
        "RESPONSE"
      )
    );
    return;
  }

  const { data: updated } = await supabase
    .from("messenger_subscriptions")
    .update({ last_inbound_at: now })
    .eq("psid", action.psid)
    .select("profile_id");
  const isSubscribed = (updated?.length ?? 0) > 0;

  if (action.type === "stop" && isSubscribed) {
    await supabase.from("messenger_subscriptions").update({ opted_out_at: now }).eq("psid", action.psid);
    await reply(
      config,
      buildTextMessage(action.psid, "You won't get GlowSync updates here anymore. Type START anytime to turn them back on.")
    );
  } else if (action.type === "start") {
    if (isSubscribed) {
      await supabase.from("messenger_subscriptions").update({ opted_out_at: null }).eq("psid", action.psid);
      await reply(config, buildTextMessage(action.psid, "You're back on! We'll send your GlowSync updates here."));
    } else {
      await reply(
        config,
        buildButtonMessage(
          action.psid,
          "To get GlowSync updates here, tap Connect Messenger on your My Glow page.",
          "Open My Glow",
          `${config.siteUrl}/my-glow`,
          "RESPONSE"
        )
      );
    }
  }
}
```

- [ ] **Step 5: Verify locally with a signed request**

Add all seven Messenger env vars to `.env.local` (real values from the Meta app; `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local), restart `npm run dev`, then:

```bash
# Handshake
curl -s "http://localhost:3000/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=$MESSENGER_VERIFY_TOKEN&hub.challenge=abc"   # → abc
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/messenger/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc"  # → 403
# Unsigned POST
curl -s -o /dev/null -w "%{http_code}\n" -X POST -d '{}' http://localhost:3000/api/messenger/webhook   # → 401
# Signed POST with an unknown ref (expects 200; a Graph reply is attempted and logged)
BODY='{"object":"page","entry":[{"messaging":[{"sender":{"id":"0"},"referral":{"ref":"nope"}}]}]}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$MESSENGER_APP_SECRET" | sed 's/^.* //')"
curl -s -w "\n%{http_code}\n" -X POST -H "Content-Type: application/json" -H "X-Hub-Signature-256: $SIG" -d "$BODY" http://localhost:3000/api/messenger/webhook   # → EVENT_RECEIVED 200
```

(Load the env vars into the shell first: `set -a; . ./.env.local; set +a`.)

Also: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/messenger/link-token` → `401`.

- [ ] **Step 6: Lint, test, commit**

Run: `npm run lint && npm test` — Expected: pass.

```bash
git add src/lib/messenger/graph.ts src/lib/supabase/queries/messenger.ts src/app/api/messenger
git commit -m "feat: Messenger link-token and signed webhook routes"
```

---

### Task 7: Messenger connect card on My Glow

**Files:**
- Create: `src/components/notifications/MessengerConnectCard.tsx`
- Modify: `src/app/my-glow/page.tsx` (imports, data fetch, left column)

**Interfaces:**
- Consumes: `MessengerStatus`, `getMyMessengerStatus` (Task 6), `getMessengerConfig` (Task 5), `POST /api/messenger/link-token`.
- Produces: `<MessengerConnectCard userId: string initialStatus: MessengerStatus />` (reused by Task 9).

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { MessengerStatus } from "@/lib/supabase/queries/messenger";

const POLL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

export default function MessengerConnectCard({
  userId,
  initialStatus,
}: {
  userId: string;
  initialStatus: MessengerStatus;
}) {
  const [status, setStatus] = useState<MessengerStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After opening Messenger, watch for the webhook to create our row.
  useEffect(() => {
    if (!waiting) return;
    const supabase = createClient();
    const started = Date.now();
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("messenger_subscriptions")
        .select("opted_out_at")
        .eq("profile_id", userId)
        .maybeSingle();
      if (data) {
        setStatus(data.opted_out_at ? "paused" : "connected");
        setWaiting(false);
      } else if (Date.now() - started > POLL_TIMEOUT_MS) {
        setWaiting(false);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, userId]);

  async function connect() {
    setBusy(true);
    setError(null);
    // Open the tab synchronously so popup blockers allow it, then point it at m.me.
    const tab = window.open("", "_blank");
    try {
      const res = await fetch("/api/messenger/link-token", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        tab?.close();
        setError(data?.error ?? "Couldn't start Messenger connect. Please try again.");
        return;
      }
      if (tab) tab.location.href = data.url;
      else window.location.href = data.url;
      setWaiting(true);
    } catch {
      tab?.close();
      setError("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await createClient().from("messenger_subscriptions").delete().eq("profile_id", userId);
    setBusy(false);
    if (deleteError) setError("Couldn't disconnect. Please try again.");
    else setStatus("none");
  }

  return (
    <div className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <MessageCircle className="h-5 w-5 text-coral-dark" /> Messenger Updates
      </h3>

      {status === "connected" && (
        <>
          <p className="mt-1 text-sm text-ink/60">Connected ✓ — reminders and updates will arrive in Messenger.</p>
          <button
            onClick={disconnect}
            disabled={busy}
            className="mt-3 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
          >
            Disconnect
          </button>
        </>
      )}

      {status === "paused" && (
        <p className="mt-1 text-sm text-ink/60">Paused — type START in Messenger to resume.</p>
      )}

      {status === "none" && (
        <>
          <p className="mt-1 text-sm text-ink/60">Get appointment reminders and updates on Messenger.</p>
          <button
            onClick={connect}
            disabled={busy || waiting}
            className="mt-3 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
          >
            {waiting ? "Waiting for Messenger…" : "Connect Messenger"}
          </button>
          {waiting && (
            <p className="mt-2 text-xs text-ink/50">Tap &ldquo;Get Started&rdquo; in Messenger to finish connecting.</p>
          )}
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Add it to My Glow**

In `src/app/my-glow/page.tsx`:

```ts
import MessengerConnectCard from "@/components/notifications/MessengerConnectCard";
import { getMyMessengerStatus } from "@/lib/supabase/queries/messenger";
import { getMessengerConfig } from "@/lib/messenger/config";
```

After the `recommendations` assignment:

```ts
  const messengerEnabled = getMessengerConfig() !== null;
  const messengerStatus = messengerEnabled ? await getMyMessengerStatus(supabase, auth.user.id) : "none";
```

In the first column, directly after `<UpcomingBookingCard appointment={upcoming} />`:

```tsx
              {messengerEnabled && <MessengerConnectCard userId={auth.user.id} initialStatus={messengerStatus} />}
```

- [ ] **Step 3: Verify manually**

1. With Messenger env vars set and migration 047 applied: sign in as a customer who is also a tester on the Meta app → My Glow shows "Messenger Updates".
2. Webhook must be reachable for the real flow: run a tunnel (`npx cloudflared tunnel --url http://localhost:3000`, or test on the deployed site) and point the Meta webhook at `<tunnel>/api/messenger/webhook`.
3. Click **Connect Messenger** → a new tab opens `m.me/<page>`; tap Get Started → the "You're connected" message arrives with **Open My Glow**; within ~3s the card flips to "Connected ✓".
4. Click **Disconnect** → card shows Connect again; row is gone.
5. With Messenger env vars removed → the card is not rendered.

- [ ] **Step 4: Lint and commit**

```bash
git add src/components/notifications/MessengerConnectCard.tsx src/app/my-glow/page.tsx
git commit -m "feat: connect Messenger from My Glow"
```

---

### Task 8: Dispatcher route

**Files:**
- Create: `src/app/api/messenger/dispatch/route.ts`

**Interfaces:**
- Consumes: `claim_messenger_outbox` RPC, `messenger_dispatch_runs` (Task 3); `skipReason`, `manilaScheduledAt`, `OutboxKind`, `classifyGraphResponse`, `retryDelayMinutes`, `SendOutcome`, `safeEqual`, `getMessengerConfig`, `missingMessengerEnv` (Task 5); `buildAppointmentTemplateMessage`, `buildButtonMessage` (Task 4); `sendToGraph` (Task 6).
- Produces: `POST /api/messenger/dispatch` → `200 { claimed, sent, skipped, failed, retried }` | `401` | `503`.

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessengerConfig, missingMessengerEnv, type MessengerConfig } from "@/lib/messenger/config";
import { safeEqual } from "@/lib/messenger/signature";
import { manilaScheduledAt, skipReason, type OutboxKind } from "@/lib/messenger/dispatchRules";
import { classifyGraphResponse, retryDelayMinutes, type SendOutcome } from "@/lib/messenger/errors";
import { buildAppointmentTemplateMessage, buildButtonMessage } from "@/lib/messenger/messages";
import type { AppointmentTemplateKind } from "@/lib/messenger/templates";
import { sendToGraph } from "@/lib/messenger/graph";

export const maxDuration = 60;

const BATCH_SIZE = 50;

type OutboxRow = {
  id: string;
  profile_id: string;
  kind: OutboxKind;
  appointment_id: string | null;
  update_type: "rescheduled" | "cancelled" | "no_show" | null;
  remind_for: string | null;
  custom_text: string | null;
  link_path: string;
  attempts: number;
};

type Rel<T> = T | T[] | null;
function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type AppointmentRow = {
  id: string;
  scheduled_date: string;
  start_time: string;
  status: string;
  session_status: string | null;
  notes: string | null;
  service: Rel<{ name: string }>;
  branch: Rel<{ name: string }>;
  client: Rel<{ full_name: string | null }>;
};

const APPOINTMENT_SELECT =
  "id, scheduled_date, start_time, status, session_status, notes, service:branch_services(name), branch:branches(name), client:profiles!appointments_client_id_fkey(full_name)";

type Result = "sent" | "skipped" | "failed" | "retried";

export async function POST(request: Request) {
  const expected = process.env.MESSENGER_DISPATCH_SECRET;
  const provided = request.headers.get("authorization") ?? "";
  if (!expected || !safeEqual(provided, `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = getMessengerConfig();
  if (!config) {
    return NextResponse.json({ error: "Messenger not configured", missing: missingMessengerEnv() }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_messenger_outbox", { p_limit: BATCH_SIZE });
  if (error) {
    console.error("claim_messenger_outbox failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data as OutboxRow[]) ?? [];
  const tally = { claimed: rows.length, sent: 0, skipped: 0, failed: 0, retried: 0 };

  for (const row of rows) {
    let result: Result;
    try {
      result = await processRow(row, supabase, config);
    } catch (err) {
      console.error("Messenger dispatch row failed:", row.id, err);
      result = await applyOutcome(supabase, row, { kind: "retry", error: String(err) });
    }
    tally[result] += 1;
  }

  await supabase
    .from("messenger_dispatch_runs")
    .update({ last_run_at: new Date().toISOString(), last_sent: tally.sent, last_failed: tally.failed })
    .eq("id", true);

  return NextResponse.json(tally);
}

async function processRow(row: OutboxRow, supabase: SupabaseClient, config: MessengerConfig): Promise<Result> {
  const { data: sub } = await supabase
    .from("messenger_subscriptions")
    .select("psid, opted_out_at, last_inbound_at")
    .eq("profile_id", row.profile_id)
    .maybeSingle();

  let appt: AppointmentRow | null = null;
  if (row.appointment_id) {
    const { data } = await supabase.from("appointments").select(APPOINTMENT_SELECT).eq("id", row.appointment_id).maybeSingle();
    appt = data as unknown as AppointmentRow | null;
  }

  const reason = skipReason({
    kind: row.kind,
    subscription: sub ? { optedOutAt: sub.opted_out_at, lastInboundAt: sub.last_inbound_at } : null,
    appointment: appt
      ? { status: appt.status, sessionStatus: appt.session_status, scheduledAt: manilaScheduledAt(appt.scheduled_date, appt.start_time) }
      : null,
    remindFor: row.remind_for,
    now: new Date(),
  });

  if (reason || !sub) {
    await supabase.from("messenger_outbox").update({ status: "skipped", skip_reason: reason ?? "not_subscribed" }).eq("id", row.id);
    return "skipped";
  }

  const payload =
    appt && (row.kind === "reminder" || row.kind === "appointment_update")
      ? buildAppointmentTemplateMessage(sub.psid, templateKind(row), {
          appointmentId: appt.id,
          firstName: (one(appt.client)?.full_name ?? "").split(" ")[0],
          serviceName: one(appt.service)?.name ?? appt.notes ?? "",
          branchName: one(appt.branch)?.name ?? "",
          scheduledDate: appt.scheduled_date,
          startTime: appt.start_time,
        })
      : buildButtonMessage(
          sub.psid,
          row.custom_text ?? "",
          row.kind === "promo" ? "View promo" : "Book now",
          `${config.siteUrl}${row.link_path}`,
          "UPDATE"
        );

  const res = await sendToGraph(config, payload);
  return applyOutcome(supabase, row, classifyGraphResponse(res.status, res.body));
}

function templateKind(row: OutboxRow): AppointmentTemplateKind {
  return row.kind === "reminder" ? "reminder" : (row.update_type ?? "rescheduled");
}

async function applyOutcome(supabase: SupabaseClient, row: OutboxRow, outcome: SendOutcome): Promise<Result> {
  const now = new Date();

  if (outcome.kind === "sent") {
    await supabase.from("messenger_outbox").update({ status: "sent", sent_at: now.toISOString(), last_error: null }).eq("id", row.id);
    return "sent";
  }

  if (outcome.kind === "retry") {
    const delay = retryDelayMinutes(row.attempts);
    if (delay !== null) {
      await supabase
        .from("messenger_outbox")
        .update({
          status: "pending",
          next_attempt_at: new Date(now.getTime() + delay * 60_000).toISOString(),
          last_error: outcome.error,
        })
        .eq("id", row.id);
      return "retried";
    }
  }

  await supabase.from("messenger_outbox").update({ status: "failed", last_error: outcome.error }).eq("id", row.id);
  if (outcome.kind === "fail_opt_out") {
    await supabase.from("messenger_subscriptions").update({ opted_out_at: now.toISOString() }).eq("profile_id", row.profile_id);
  }
  return "failed";
}
```

- [ ] **Step 2: Verify the auth paths**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/messenger/dispatch                       # → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer wrong" http://localhost:3000/api/messenger/dispatch   # → 401
curl -s -X POST -H "Authorization: Bearer $MESSENGER_DISPATCH_SECRET" http://localhost:3000/api/messenger/dispatch   # → {"claimed":0,...}
```

- [ ] **Step 3: Verify a real send end to end**

With your own test account connected (Task 7) and templates created (Task 11 — if not done yet, do Task 11 Step 3 first):
1. From Front Desk, cancel one of that client's test appointments.
2. Run the dispatch curl above → `{"claimed":1,"sent":1,...}`; the "cancelled" message arrives in Messenger; **View appointment** opens `/my-glow/appointments/<id>` (404 until Task 9 — acceptable here).
3. In SQL: `select status, skip_reason, last_error from messenger_outbox order by created_at desc limit 5;` → `sent`.
4. Insert a promo row for a client whose `last_inbound_at` is older than 24h and dispatch → `skipped | outside_24h_window`.

- [ ] **Step 4: Lint and commit**

```bash
git add src/app/api/messenger/dispatch/route.ts
git commit -m "feat: Messenger outbox dispatcher with retry and skip rules"
```

---

### Task 9: Appointment detail page and My Bookings link

**Files:**
- Create: `src/app/my-glow/appointments/[id]/page.tsx`
- Modify: `src/lib/supabase/queries/myGlow.ts` (append), `src/components/my-glow/MyBookingsSection.tsx`

**Interfaces:**
- Consumes: `loginRedirectPath` (Task 1); `appointmentStatusStyles`, `describeHistoryEvent`, `formatAppointmentDate`, `formatAppointmentTime`, `humanizeStatus` (Task 4); `MessengerConnectCard`, `getMyMessengerStatus`, `getMessengerConfig`.
- Produces: `type ClientAppointmentDetail`; `getClientAppointment(supabase, clientId, appointmentId): Promise<ClientAppointmentDetail | null>`; route `/my-glow/appointments/[id]`.

- [ ] **Step 1: Append the query to `src/lib/supabase/queries/myGlow.ts`**

```ts
export type ClientAppointmentDetail = {
  id: string;
  bookingCode: string | null;
  status: string;
  sessionStatus: string | null;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  serviceName: string | null;
  professionalName: string | null;
  branchName: string | null;
  branchPhone: string | null;
  rescheduleCount: number;
  originalScheduledDate: string | null;
  originalStartTime: string | null;
  history: { id: string; eventType: string; fromValue: string | null; toValue: string | null; createdAt: string }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One appointment, only if it belongs to `clientId` — otherwise null,
 * so callers can't tell "doesn't exist" from "not yours". */
export async function getClientAppointment(
  supabase: SupabaseClient,
  clientId: string,
  appointmentId: string
): Promise<ClientAppointmentDetail | null> {
  if (!UUID_RE.test(appointmentId)) return null;

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, booking_code, status, session_status, scheduled_date, start_time, duration_minutes, notes, reschedule_count, original_scheduled_date, original_start_time, service:branch_services(name), professional:staff_members(full_name), branch:branches(name, phone)"
    )
    .eq("id", appointmentId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) console.error("getClientAppointment failed:", error);
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    booking_code: string | null;
    status: string;
    session_status: string | null;
    scheduled_date: string;
    start_time: string;
    duration_minutes: number;
    notes: string | null;
    reschedule_count: number | null;
    original_scheduled_date: string | null;
    original_start_time: string | null;
    service: Rel<{ name: string }>;
    professional: Rel<{ full_name: string }>;
    branch: Rel<{ name: string; phone: string | null }>;
  };

  const { data: historyRows, error: historyError } = await supabase
    .from("appointment_history")
    .select("id, event_type, from_value, to_value, created_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: true });
  if (historyError) console.error("getClientAppointment history failed:", historyError);

  const branch = one(row.branch);
  return {
    id: row.id,
    bookingCode: row.booking_code,
    status: row.status,
    sessionStatus: row.session_status,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    serviceName: one(row.service)?.name ?? row.notes ?? null,
    professionalName: one(row.professional)?.full_name ?? null,
    branchName: branch?.name ?? null,
    branchPhone: branch?.phone ?? null,
    rescheduleCount: row.reschedule_count ?? 0,
    originalScheduledDate: row.original_scheduled_date,
    originalStartTime: row.original_start_time,
    history: ((historyRows as { id: string; event_type: string; from_value: string | null; to_value: string | null; created_at: string }[]) ?? []).map(
      (h) => ({ id: h.id, eventType: h.event_type, fromValue: h.from_value, toValue: h.to_value, createdAt: h.created_at })
    ),
  };
}
```

- [ ] **Step 2: Create `src/app/my-glow/appointments/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, MapPin, Phone, User } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MessengerConnectCard from "@/components/notifications/MessengerConnectCard";
import { createClient } from "@/lib/supabase/server";
import { getClientAppointment } from "@/lib/supabase/queries/myGlow";
import { getMyMessengerStatus } from "@/lib/supabase/queries/messenger";
import { getMessengerConfig } from "@/lib/messenger/config";
import { loginRedirectPath } from "@/lib/loginRedirect";
import {
  appointmentStatusStyles,
  describeHistoryEvent,
  formatAppointmentDate,
  formatAppointmentTime,
  humanizeStatus,
} from "@/lib/appointmentFormat";

export const dynamic = "force-dynamic";

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(loginRedirectPath(`/my-glow/appointments/${id}`));

  const appt = await getClientAppointment(supabase, auth.user.id, id);
  if (!appt) notFound();

  const messengerEnabled = getMessengerConfig() !== null;
  const messengerStatus = messengerEnabled ? await getMyMessengerStatus(supabase, auth.user.id) : "none";

  const statusKey = appt.sessionStatus ?? appt.status;
  const badgeClass = appointmentStatusStyles[statusKey] ?? appointmentStatusStyles[appt.status] ?? "bg-ink/10 text-ink/50";

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link href="/my-glow" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to My Glow
          </Link>

          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-semibold text-ink">{appt.serviceName ?? "Appointment"}</h1>
              <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${badgeClass}`}>
                {humanizeStatus(statusKey)}
              </span>
            </div>

            <div className="mt-5 space-y-2 text-sm text-ink/70">
              <p className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-coral-dark" />
                {formatAppointmentDate(appt.scheduledDate)} · {formatAppointmentTime(appt.startTime)} ({appt.durationMinutes} min)
              </p>
              {appt.branchName && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-coral-dark" /> {appt.branchName}
                </p>
              )}
              {appt.professionalName && (
                <p className="flex items-center gap-2">
                  <User className="h-4 w-4 text-coral-dark" /> {appt.professionalName}
                </p>
              )}
              {appt.rescheduleCount > 0 && appt.originalScheduledDate && (
                <p className="text-ink/50">
                  Originally scheduled for {formatAppointmentDate(appt.originalScheduledDate)}
                  {appt.originalStartTime && <> · {formatAppointmentTime(appt.originalStartTime)}</>}
                </p>
              )}
              {appt.bookingCode && <p className="text-xs text-ink/40">Ref: {appt.bookingCode}</p>}
            </div>

            <p className="mt-6 flex items-center gap-1.5 border-t border-ink/10 pt-4 text-sm text-ink/60">
              <Phone className="h-4 w-4 shrink-0" />
              Need to change this? Call{" "}
              {appt.branchPhone ? (
                <a href={`tel:${appt.branchPhone}`} className="font-medium text-coral-dark underline">
                  {appt.branchPhone}
                </a>
              ) : (
                "your branch"
              )}
              .
            </p>
          </div>

          {appt.history.length > 0 && (
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="font-semibold text-ink">Timeline</h2>
              <ol className="mt-4 space-y-3 border-l border-rose/60 pl-4">
                {appt.history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <p className="text-ink">{describeHistoryEvent(h)}</p>
                    <p className="text-xs text-ink/40">
                      {new Date(h.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {messengerEnabled && <MessengerConnectCard userId={auth.user.id} initialStatus={messengerStatus} />}
        </div>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: Link from My Bookings and reuse the shared status styles**

In `src/components/my-glow/MyBookingsSection.tsx`:
- Add `import Link from "next/link";` and `import { appointmentStatusStyles } from "@/lib/appointmentFormat";`.
- Delete the local `statusStyles` constant (lines 31-38) and replace the three `statusStyles[...]` references on line 99 with `appointmentStatusStyles[...]`.
- After the `{b.booking_code && ...}` line (116) add:

```tsx
              <Link
                href={`/my-glow/appointments/${b.id}`}
                className="mt-1 inline-block text-sm font-medium text-coral-dark hover:underline"
              >
                View details &rarr;
              </Link>
```

- [ ] **Step 4: Verify manually**

1. Signed in as a customer: My Glow → My Bookings → **View details** opens the page with correct service/branch/time/status and a timeline.
2. Rescheduled appointment shows "Originally scheduled for …" and a "Rescheduled from … to …" timeline entry.
3. Signed out: open `/my-glow/appointments/<id>` → Login modal → after login lands back on that page.
4. Signed in as a different customer: same URL → 404. `/my-glow/appointments/not-a-uuid` → 404.
5. Messenger link from Task 8 Step 3 now opens this page.

- [ ] **Step 5: Lint, test, commit**

Run: `npm run lint && npm test`

```bash
git add "src/app/my-glow/appointments/[id]/page.tsx" src/lib/supabase/queries/myGlow.ts src/components/my-glow/MyBookingsSection.tsx
git commit -m "feat: client appointment detail page with timeline"
```

---

### Task 10: Admin broadcasts to Messenger with promo links

**Files:**
- Modify: `src/lib/supabase/queries/notificationBroadcasts.ts`, `src/lib/supabase/queries/messenger.ts` (append), `src/app/api/admin/notifications/broadcast/route.ts` (whole file), `src/app/admin/notifications/page.tsx` (whole file), `src/components/admin/notifications/NotificationsManager.tsx` (whole file)

**Interfaces:**
- Consumes: `messenger_broadcast_results` view, `notification_broadcasts.channels/promo_id`, `messenger_outbox` (Task 3); `getMessengerConfig`, `missingMessengerEnv` (Task 5); `createAdminClient`.
- Produces:
  - `NotificationBroadcast` gains `channels: string[]`
  - `type PromoOption = { id: string; label: string }`; `getActivePromoOptions(supabase): Promise<PromoOption[]>`
  - `getMessengerAudience(admin): Promise<{ connected: number; reachableNow: number }>`
  - `type DispatchStatus = { lastRunAt: string | null; pendingCount: number; oldestPendingAt: string | null }`; `getDispatchStatus(supabase): Promise<DispatchStatus>`
  - `type MessengerResults = { sent: number; skipped: number; failed: number; pending: number }`; `getMessengerResultsByBroadcast(supabase, ids: string[]): Promise<Record<string, MessengerResults>>`
  - Broadcast API body `{ subject, message, linkTarget: "booking" | "promo", promoId?: string, channels: ("email" | "messenger")[] }` → `{ sentCount, totalRecipients, messengerQueued, broadcastId }`

- [ ] **Step 1: Queries**

In `src/lib/supabase/queries/notificationBroadcasts.ts`:
- Add `channels: string[];` to `NotificationBroadcast` and `channels: string[] | null;` to `Row`.
- Change the select to `"id, subject, message, link_path, recipient_count, created_at, channels, sent_by:profiles(full_name)"` and map `channels: row.channels ?? ["email"],`.
- Append:

```ts
export type PromoOption = { id: string; label: string };

export async function getActivePromoOptions(supabase: SupabaseClient): Promise<PromoOption[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("branch_promotions")
    .select("id, title, branch:branches(name)")
    .eq("is_active", true)
    .or(`valid_until.is.null,valid_until.gte.${today}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getActivePromoOptions failed:", error);
    return [];
  }
  return ((data as unknown as { id: string; title: string; branch: Rel<{ name: string }> }[]) ?? []).map((p) => ({
    id: p.id,
    label: one(p.branch)?.name ? `${p.title} — ${one(p.branch)!.name}` : p.title,
  }));
}
```

Append to `src/lib/supabase/queries/messenger.ts`:

```ts
export async function getMessengerAudience(admin: SupabaseClient): Promise<{ connected: number; reachableNow: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [all, recent] = await Promise.all([
    admin.from("messenger_subscriptions").select("profile_id", { count: "exact", head: true }).is("opted_out_at", null),
    admin
      .from("messenger_subscriptions")
      .select("profile_id", { count: "exact", head: true })
      .is("opted_out_at", null)
      .gte("last_inbound_at", since),
  ]);
  if (all.error) console.error("getMessengerAudience failed:", all.error);
  return { connected: all.count ?? 0, reachableNow: recent.count ?? 0 };
}

export type DispatchStatus = { lastRunAt: string | null; pendingCount: number; oldestPendingAt: string | null };

export async function getDispatchStatus(supabase: SupabaseClient): Promise<DispatchStatus> {
  const [run, pending, oldest] = await Promise.all([
    supabase.from("messenger_dispatch_runs").select("last_run_at").eq("id", true).maybeSingle(),
    supabase.from("messenger_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "sending"]),
    supabase
      .from("messenger_outbox")
      .select("created_at")
      .in("status", ["pending", "sending"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    lastRunAt: run.data?.last_run_at ?? null,
    pendingCount: pending.count ?? 0,
    oldestPendingAt: oldest.data?.created_at ?? null,
  };
}

export type MessengerResults = { sent: number; skipped: number; failed: number; pending: number };

export async function getMessengerResultsByBroadcast(
  supabase: SupabaseClient,
  broadcastIds: string[]
): Promise<Record<string, MessengerResults>> {
  if (broadcastIds.length === 0) return {};
  const { data, error } = await supabase
    .from("messenger_broadcast_results")
    .select("broadcast_id, sent, skipped, failed, pending")
    .in("broadcast_id", broadcastIds);
  if (error) {
    console.error("getMessengerResultsByBroadcast failed:", error);
    return {};
  }
  return Object.fromEntries(
    ((data as ({ broadcast_id: string } & MessengerResults)[]) ?? []).map(({ broadcast_id, ...r }) => [broadcast_id, r])
  );
}
```

- [ ] **Step 2: Replace `src/app/api/admin/notifications/broadcast/route.ts`**

```ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessengerConfig } from "@/lib/messenger/config";

const BRAND_COLOR = "#C9A84A";

type Channel = "email" | "messenger";

function buildEmailHtml(subject: string, message: string, linkUrl: string, buttonLabel: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 22px; font-weight: 700; color: #2b1a16; font-style: italic;">Blush Spa &amp; Aesthetics</p>
      <h1 style="font-size: 18px; color: #2b1a16;">${subject}</h1>
      <p style="font-size: 14px; color: #2b1a16; line-height: 1.6; white-space: pre-wrap;">${message}</p>
      <a href="${linkUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: ${BRAND_COLOR}; color: white; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        ${buttonLabel}
      </a>
    </div>
  `;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const linkTarget = body?.linkTarget === "promo" ? "promo" : "booking";
  const promoId = typeof body?.promoId === "string" ? body.promoId : null;
  const channels: Channel[] = Array.isArray(body?.channels)
    ? (body.channels as unknown[]).filter((c): c is Channel => c === "email" || c === "messenger")
    : ["email"];

  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }
  if (channels.length === 0) {
    return NextResponse.json({ error: "Choose at least one channel." }, { status: 400 });
  }

  let linkPath = "/?intent=booking";
  if (linkTarget === "promo") {
    const { data: promo } = promoId
      ? await supabase.from("branch_promotions").select("id").eq("id", promoId).eq("is_active", true).maybeSingle()
      : { data: null };
    if (!promo) {
      return NextResponse.json({ error: "Choose an active promo to link to." }, { status: 400 });
    }
    linkPath = `/promos/${promo.id}`;
  }

  const wantsEmail = channels.includes("email");
  const wantsMessenger = channels.includes("messenger");

  const apiKey = process.env.RESEND_API_KEY;
  if (wantsEmail && !apiKey) {
    return NextResponse.json(
      { error: "Email sending isn't set up yet — add RESEND_API_KEY to continue." },
      { status: 500 }
    );
  }
  if (wantsMessenger && !getMessengerConfig()) {
    return NextResponse.json({ error: "Messenger isn't set up yet." }, { status: 400 });
  }

  const emails: string[] = [];
  if (wantsEmail) {
    const PAGE_SIZE = 1000;
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data: page, error: recipientsError } = await supabase
        .from("profiles")
        .select("email")
        .eq("role", "customer")
        .not("email", "is", null)
        .range(offset, offset + PAGE_SIZE - 1);

      if (recipientsError) {
        return NextResponse.json({ error: recipientsError.message }, { status: 500 });
      }

      const rows = (page as { email: string }[]) ?? [];
      emails.push(...rows.map((r) => r.email));
      if (rows.length < PAGE_SIZE) break;
    }
  }

  const admin = createAdminClient();
  const subscriberIds: string[] = [];
  if (wantsMessenger) {
    const { data: subs, error: subsError } = await admin
      .from("messenger_subscriptions")
      .select("profile_id")
      .is("opted_out_at", null);
    if (subsError) {
      return NextResponse.json({ error: subsError.message }, { status: 500 });
    }
    subscriberIds.push(...((subs as { profile_id: string }[]) ?? []).map((s) => s.profile_id));
  }

  if (emails.length === 0 && subscriberIds.length === 0) {
    return NextResponse.json({ error: "No eligible recipients." }, { status: 400 });
  }

  const { data: broadcast, error: insertError } = await supabase
    .from("notification_broadcasts")
    .insert({
      subject,
      message,
      link_path: linkPath,
      channels,
      promo_id: linkTarget === "promo" ? promoId : null,
      sent_by: auth.user.id,
      recipient_count: 0,
    })
    .select("id")
    .single();

  if (insertError || !broadcast) {
    return NextResponse.json({ error: insertError?.message ?? "Couldn't save the broadcast." }, { status: 500 });
  }

  // Queue Messenger first so an email failure can't lose it.
  let messengerQueued = 0;
  if (subscriberIds.length > 0) {
    const { error: queueError } = await admin.from("messenger_outbox").insert(
      subscriberIds.map((profileId) => ({
        profile_id: profileId,
        kind: linkTarget === "promo" ? "promo" : "booking_invite",
        promo_id: linkTarget === "promo" ? promoId : null,
        broadcast_id: broadcast.id,
        custom_text: `${subject}\n\n${message}`,
        link_path: linkPath,
      }))
    );
    if (queueError) {
      console.error("Queueing Messenger broadcast failed:", queueError);
    } else {
      messengerQueued = subscriberIds.length;
    }
  }

  let sentCount = 0;
  let lastError: string | null = null;
  if (emails.length > 0) {
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL ?? "GlowSync <onboarding@resend.dev>";
    const origin = new URL(request.url).origin;
    const html = buildEmailHtml(subject, message, `${origin}${linkPath}`, linkTarget === "promo" ? "View Promo" : "Book Now");

    const CHUNK_SIZE = 100;
    for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
      const chunk = emails.slice(i, i + CHUNK_SIZE);
      const { data: batchResult, error: sendError } = await resend.batch.send(
        chunk.map((to) => ({ from, to, subject, html })),
        { batchValidation: "permissive" }
      );
      if (sendError) {
        console.error("Resend batch send failed:", sendError);
        lastError = sendError.message;
        continue;
      }
      sentCount += batchResult?.data?.length ?? 0;
      if (batchResult && "errors" in batchResult && batchResult.errors?.length) {
        console.error("Resend per-recipient failures:", batchResult.errors);
        lastError = batchResult.errors[0]?.message ?? lastError;
      }
    }

    await supabase.from("notification_broadcasts").update({ recipient_count: sentCount }).eq("id", broadcast.id);
  }

  const result = { sentCount, totalRecipients: emails.length, messengerQueued, broadcastId: broadcast.id };

  if (emails.length > 0 && sentCount === 0 && messengerQueued === 0) {
    return NextResponse.json({ error: lastError ?? "Failed to send — nothing went out.", ...result }, { status: 502 });
  }

  return NextResponse.json(result);
}
```

- [ ] **Step 3: Replace `src/app/admin/notifications/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActivePromoOptions,
  getBroadcastHistory,
  getEligibleRecipientCount,
} from "@/lib/supabase/queries/notificationBroadcasts";
import {
  getDispatchStatus,
  getMessengerAudience,
  getMessengerResultsByBroadcast,
} from "@/lib/supabase/queries/messenger";
import { getMessengerConfig, missingMessengerEnv } from "@/lib/messenger/config";
import NotificationsManager from "@/components/admin/notifications/NotificationsManager";

export default async function AdminNotificationsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();

  if (!profile || profile.role !== "admin") redirect("/admin");

  const messengerConfigured = getMessengerConfig() !== null;

  const [recipientCount, history, promos, audience, dispatch] = await Promise.all([
    getEligibleRecipientCount(supabase),
    getBroadcastHistory(supabase),
    getActivePromoOptions(supabase),
    messengerConfigured ? getMessengerAudience(createAdminClient()) : Promise.resolve({ connected: 0, reachableNow: 0 }),
    getDispatchStatus(supabase),
  ]);
  const messengerResults = await getMessengerResultsByBroadcast(
    supabase,
    history.map((h) => h.id)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Notifications</h1>
        <p className="text-sm text-ink/50">Send an announcement to your clients by email and Messenger.</p>
      </div>
      <NotificationsManager
        initialRecipientCount={recipientCount}
        initialHistory={history}
        promos={promos}
        messenger={{ configured: messengerConfigured, missing: missingMessengerEnv(), ...audience, ...dispatch }}
        messengerResults={messengerResults}
      />
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/components/admin/notifications/NotificationsManager.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import type { NotificationBroadcast, PromoOption } from "@/lib/supabase/queries/notificationBroadcasts";
import type { DispatchStatus, MessengerResults } from "@/lib/supabase/queries/messenger";

type MessengerInfo = DispatchStatus & {
  configured: boolean;
  missing: string[];
  connected: number;
  reachableNow: number;
};

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function NotificationsManager({
  initialRecipientCount,
  initialHistory,
  promos,
  messenger,
  messengerResults,
}: {
  initialRecipientCount: number;
  initialHistory: NotificationBroadcast[];
  promos: PromoOption[];
  messenger: MessengerInfo;
  messengerResults: Record<string, MessengerResults>;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [linkTarget, setLinkTarget] = useState<"booking" | "promo">("booking");
  const [promoId, setPromoId] = useState("");
  const [useEmail, setUseEmail] = useState(true);
  const [useMessenger, setUseMessenger] = useState(messenger.configured);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState(initialHistory);

  const channels = [...(useEmail ? ["email"] : []), ...(useMessenger ? ["messenger"] : [])];
  const emailCount = useEmail ? initialRecipientCount : 0;
  const messengerCount = useMessenger ? messenger.connected : 0;
  const linkPath = linkTarget === "promo" ? `/promos/${promoId}` : "/?intent=booking";

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, linkTarget, promoId: linkTarget === "promo" ? promoId : undefined, channels }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setError(data?.error ?? "Failed to send. Please try again.");
        return;
      }

      const parts: string[] = [];
      if (useEmail) {
        parts.push(
          data.sentCount < data.totalRecipients
            ? `Email sent to ${data.sentCount} of ${data.totalRecipients} — some deliveries failed.`
            : `Email sent to ${plural(data.sentCount, "client")}.`
        );
      }
      if (useMessenger) parts.push(`Messenger queued for ${plural(data.messengerQueued, "client")}.`);
      setResult(parts.join(" "));

      setHistory((prev) => [
        {
          id: data.broadcastId,
          subject,
          message,
          link_path: linkPath,
          recipient_count: data.sentCount,
          created_at: new Date().toISOString(),
          sent_by_name: "You",
          channels,
        },
        ...prev,
      ]);
      setSubject("");
      setMessage("");
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  const canSend =
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    channels.length > 0 &&
    emailCount + messengerCount > 0 &&
    (linkTarget === "booking" || promoId !== "");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <MessageCircle className="h-4 w-4 text-coral-dark" /> Messenger
        </h2>
        {messenger.configured ? (
          <p className="mt-1 text-sm text-ink/60">
            {plural(messenger.connected, "client")} connected · {messenger.reachableNow} reachable for promos now (messaged the
            Page in the last 24h) · Last dispatch {messenger.lastRunAt ? formatRelative(messenger.lastRunAt) : "never"} ·{" "}
            {messenger.pendingCount} pending
            {messenger.oldestPendingAt && Date.now() - new Date(messenger.oldestPendingAt).getTime() > 10 * 60000 && (
              <span className="font-medium text-red-600"> — messages are waiting over 10 minutes; check the dispatch cron.</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink/60">
            Not configured — set {messenger.missing.join(", ")} to enable Messenger.
          </p>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-ink">Compose Broadcast</h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-ink/70">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. New Autumn Promo!"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-ink/70">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="What do you want to tell your clients?"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-ink/70">Link to</label>
              <select
                value={linkTarget}
                onChange={(e) => setLinkTarget(e.target.value as "booking" | "promo")}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
              >
                <option value="booking">Booking page</option>
                <option value="promo" disabled={promos.length === 0}>
                  A promo…
                </option>
              </select>
            </div>
            {linkTarget === "promo" && (
              <div>
                <label className="text-sm font-medium text-ink/70">Promo</label>
                <select
                  value={promoId}
                  onChange={(e) => setPromoId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
                >
                  <option value="">Choose a promo</option>
                  {promos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-ink/70">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={useEmail} onChange={(e) => setUseEmail(e.target.checked)} /> Email
            </label>
            <label className={`flex items-center gap-2 ${messenger.configured ? "" : "opacity-50"}`}>
              <input
                type="checkbox"
                checked={useMessenger}
                disabled={!messenger.configured}
                onChange={(e) => setUseMessenger(e.target.checked)}
              />{" "}
              Messenger
            </label>
          </div>

          <p className="text-sm text-ink/50">
            {useEmail && `Email: ${plural(initialRecipientCount, "client")}`}
            {useEmail && useMessenger && " · "}
            {useMessenger &&
              `Messenger: ${messenger.connected} connected (${messenger.reachableNow} reachable now, within 24h)`}
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && <p className="text-sm text-green-700">{result}</p>}

          <button
            onClick={() => setConfirming(true)}
            disabled={!canSend || sending}
            className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-ink">Broadcast History</h2>
        <div className="mt-4 divide-y divide-ink/5">
          {history.length === 0 ? (
            <p className="py-3 text-sm text-ink/50">No broadcasts sent yet.</p>
          ) : (
            history.map((h) => {
              const m = messengerResults[h.id];
              return (
                <div key={h.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ink">{h.subject}</p>
                    <span className="text-xs text-ink/40">{formatRelative(h.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink/50">
                    {h.sent_by_name}
                    {h.channels.includes("email") && <> · Email: {plural(h.recipient_count, "recipient")}</>}
                    {h.channels.includes("messenger") &&
                      (m ? (
                        <>
                          {" "}
                          · Messenger: {m.sent} sent, {m.skipped} skipped, {m.failed} failed
                          {m.pending > 0 && `, ${m.pending} pending`}
                        </>
                      ) : (
                        <> · Messenger: queued</>
                      ))}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="font-semibold text-ink">Send this broadcast?</h2>
            <p className="mt-2 text-sm text-ink/60">
              This sends <span className="font-medium text-ink">&ldquo;{subject}&rdquo;</span>
              {useEmail && (
                <>
                  {" "}
                  by email to <span className="font-medium text-ink">{plural(emailCount, "client")}</span>
                </>
              )}
              {useEmail && useMessenger && " and"}
              {useMessenger && (
                <>
                  {" "}
                  by Messenger to <span className="font-medium text-ink">{messenger.reachableNow}</span> of{" "}
                  {messenger.connected} connected clients (the rest are outside Meta&apos;s 24-hour window)
                </>
              )}
              . This can&apos;t be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={sending}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? "Sending..." : "Yes, Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify manually**

1. Admin → Notifications: Messenger card shows counts (or "Not configured — set …" when env vars are removed; Messenger checkbox disabled).
2. Link to "A promo…" → pick a promo; Send → confirm dialog names both channels and counts.
3. Email arrives with **View Promo** → `/promos/<id>`. With a connected tester who messaged the Page in the last 24h, run the dispatch curl (or wait ≤1 min on the deployed site) → Messenger button template **View promo** opens the promo page.
4. Refresh: history row shows "Messenger: 1 sent, N skipped, 0 failed".
5. Booking-page broadcast → **Book now** opens `/?intent=booking` → booking modal (after login if signed out).
6. Email-only broadcast still works exactly as before.

- [ ] **Step 6: Lint, build, commit**

Run: `npm run lint && npm test && npm run build` — Expected: all pass.

```bash
git add src/lib/supabase/queries/notificationBroadcasts.ts src/lib/supabase/queries/messenger.ts src/app/api/admin/notifications/broadcast/route.ts src/app/admin/notifications/page.tsx src/components/admin/notifications/NotificationsManager.tsx
git commit -m "feat: admin broadcasts via Messenger with promo deep links"
```

---

### Task 11: Page setup script and go-live docs

**Files:**
- Create: `scripts/messenger-setup.ts`
- Modify: `tsconfig.json` (`exclude`), `README.md` (append section)

**Interfaces:**
- Consumes: `APPOINTMENT_TEMPLATES`, `templateCreatePayload`, `AppointmentTemplateKind` (Task 4).

- [ ] **Step 1: Exclude scripts from the Next typecheck**

In `tsconfig.json` change `"exclude": ["node_modules"]` to `"exclude": ["node_modules", "scripts"]` (the script uses a `.ts` import extension that Node's type stripping needs).

- [ ] **Step 2: Create `scripts/messenger-setup.ts`**

```ts
// One-time (idempotent) Messenger Page setup:
//   node --env-file=.env.local scripts/messenger-setup.ts
// 1. Get Started button + greeting (needed for m.me ref links on new threads)
// 2. Creates the appointment utility templates if missing and prints their status
import {
  APPOINTMENT_TEMPLATES,
  templateCreatePayload,
  type AppointmentTemplateKind,
} from "../src/lib/messenger/templates.ts";

const GRAPH = "https://graph.facebook.com/v23.0";
const pageId = process.env.MESSENGER_PAGE_ID;
const token = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

if (!pageId || !token || !siteUrl) {
  console.error("Set MESSENGER_PAGE_ID, MESSENGER_PAGE_ACCESS_TOKEN and NEXT_PUBLIC_SITE_URL first.");
  process.exit(1);
}

async function graph(method: string, path: string, body?: unknown) {
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, json };
}

const profile = await graph("POST", "/me/messenger_profile", {
  get_started: { payload: "GET_STARTED" },
  greeting: [
    {
      locale: "default",
      text: "Hi {{user_first_name}}! Tap Get Started to receive your GlowSync appointment reminders and updates.",
    },
  ],
});
console.log(profile.ok ? "✓ Get Started + greeting set" : `✗ Messenger profile: ${JSON.stringify(profile.json)}`);

for (const kind of Object.keys(APPOINTMENT_TEMPLATES) as AppointmentTemplateKind[]) {
  const { name } = APPOINTMENT_TEMPLATES[kind];
  const existing = await graph("GET", `/${pageId}/message_templates?name=${name}&fields=name,status`);
  const found = (existing.json?.data ?? []).find((t: { name: string }) => t.name === name);
  if (found) {
    console.log(`• ${name}: ${found.status}`);
    continue;
  }
  const created = await graph("POST", `/${pageId}/message_templates`, templateCreatePayload(kind, siteUrl));
  console.log(created.ok ? `✓ ${name} created: ${JSON.stringify(created.json)}` : `✗ ${name}: ${JSON.stringify(created.json)}`);
}
```

- [ ] **Step 3: Run it against the real Page**

Set `NEXT_PUBLIC_SITE_URL` in `.env.local` to the **deployed** URL first (it is baked into the template buttons).
Run: `node --env-file=.env.local scripts/messenger-setup.ts`
Expected: `✓ Get Started + greeting set` and each template `created` then, on a second run, `• glowsync_appt_…: APPROVED`. If a template is rejected (`INCORRECT_PARAMS`, `PARAMS_TO_WORD_RATIO_EXCEED_LIMIT`, `TAG_SHOULD_BE_MARKETING`), adjust its body/example in `templates.ts`, keep the Task 4 tests passing, and rerun.

- [ ] **Step 4: Append go-live docs to `README.md`**

```markdown
## Messenger notifications

Clients connect Messenger from **My Glow**; GlowSync then sends appointment
reminders (~24h before), updates (rescheduled / cancelled / no-show), and
admin promo / booking broadcasts, each with a button that deep-links into
the site. Design: `docs/superpowers/specs/2026-09-29-messenger-notifications-design.md`.

Setup:

1. **Meta app** — add the Messenger product, connect the Page, generate a
   Page access token with `pages_messaging` and `page_utility_messaging`.
2. **Webhook** — callback `https://<site>/api/messenger/webhook`, verify
   token = `MESSENGER_VERIFY_TOKEN`; subscribe the Page to `messages`,
   `messaging_postbacks`, `messaging_referrals`,
   `message_template_status_update`.
3. **Env (Vercel + `.env.local`)** — `MESSENGER_PAGE_ID`,
   `MESSENGER_PAGE_ACCESS_TOKEN`, `MESSENGER_APP_SECRET`,
   `MESSENGER_VERIFY_TOKEN`, `MESSENGER_DISPATCH_SECRET` (any long random
   string), `NEXT_PUBLIC_MESSENGER_PAGE_USERNAME`, `NEXT_PUBLIC_SITE_URL`.
4. **Supabase** — apply `supabase/migrations/047_messenger.sql` in the SQL
   Editor, then add Vault secrets:
   `select vault.create_secret('https://<site>/api/messenger/dispatch', 'messenger_dispatch_url');`
   `select vault.create_secret('<MESSENGER_DISPATCH_SECRET>', 'messenger_dispatch_secret');`
5. **Templates** — `node --env-file=.env.local scripts/messenger-setup.ts`
   (rerun if the site domain changes).
6. **Testing** — in Development mode only people with a role on the Meta
   app receive messages; add testers under App Roles.
7. **Real clients** — submit App Review for `pages_messaging` and
   `page_utility_messaging`, then switch the app to Live.

Promos and booking invites only reach clients who messaged the Page in the
last 24 hours (Meta policy); the rest are recorded as skipped.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/messenger-setup.ts tsconfig.json README.md
git commit -m "feat: Messenger Page setup script and go-live docs"
```

---

### Task 12: Final verification on the deployed site

**Files:** none (fix-ups only if something fails).

- [ ] **Step 1: Static checks**

Run: `npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 2: Deploy and configure**

Deploy to Vercel with the env vars; complete README setup steps 2, 4 (Vault secrets with the deployed URL), and 5.

- [ ] **Step 3: End-to-end checklist (spec §7)**

1. Connect from My Glow; "connected" reply arrives; card flips to Connected.
2. From Front Desk: reschedule, cancel, mark no-show → exactly one message each within ~1 minute, each **View appointment** button opening the right page.
3. Reminder: set a test appointment ~23.5h ahead; within 15 min one reminder is queued and sent within another minute; no duplicate afterwards.
4. Logged out on a phone: tap a Messenger link → Login → lands on the appointment page (Google, then Facebook).
5. Admin promo broadcast on both channels → counts match; promo page opens from Messenger and email; history shows Messenger results.
6. STOP / START in Messenger → confirmation replies; card shows Paused / Connected; a broadcast while paused is recorded as `opted_out`.
7. `/?login=1&next=@evil.com` and `/auth/callback?next=@evil.com` → `/`.
8. Another client's appointment id → 404.
9. `select cron.job_run_details` shows `messenger-dispatch` and `messenger-reminders` succeeding: `select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;`

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address end-to-end verification findings"
```
(Only if Step 3 required changes.)
