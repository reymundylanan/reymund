# Admin Broadcast Notifications & Deep-Link Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin send a one-off broadcast email to every client, with a link that opens the booking flow directly — logging the client in first if needed, then continuing automatically instead of dropping them on the homepage.

**Architecture:** A deep-link query param (`?intent=booking`) is resolved by a small client component mounted once at the app root, reusing the existing global `BookingContext`/`LoginModalContext` overlays (neither has its own route) and the OAuth callback route's already-existing-but-unused `?next=` redirect param. Broadcast sending is a server-only Route Handler (keeps the Resend API key off the client) backed by a new logging table, fronted by a new admin page reachable from both the sidebar and the Dashboard's quick actions.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (`@supabase/supabase-js`), Resend (new dependency), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-25-notification-broadcast-design.md`

## Global Constraints

- Broadcast is the only send mode — no per-client targeting, no automatic/scheduled sends (both explicitly deferred by the user).
- Broadcasts ignore the existing marketing-consent checkbox on Login — send to every `profiles` row where `role = 'customer' and email is not null` (explicit user decision).
- Messenger delivery is out of scope entirely (deferred to a later phase pending external Facebook setup).
- The deep link format is `/?intent=booking` — lands on any page, resolved by one root-mounted component, not a dedicated route.
- `BookingModal`'s `service` prop is never read internally (confirmed by search during spec work) — a placeholder value is always safe to pass.
- No automated test framework exists in this repo — verification is `npx tsc --noEmit` + `npm run lint` after each code task, plus manual walkthroughs via the `run` skill for behavior that needs a browser or a real inbox.

## Review Focus

- **URL-stripping timing when not logged in**: if the `?intent=booking` query param gets removed from the address bar *before* the user actually completes login, the OAuth `next=` redirect (built from the current URL at click time) loses the intent, and the client lands back on a plain homepage after login instead of the booking flow. The intent handler must only strip the param after the booking modal has actually opened, never on the "redirect to login" branch.
- **Already-logged-in click**: a client who's already signed in and clicks the link should see the booking flow open immediately, no Login detour at all.
- **Zero eligible recipients**: Send must be disabled (client and server side) rather than silently "succeeding" with 0 sent, or reporting a confusing count.
- **Resend not configured**: hitting Send before `RESEND_API_KEY` exists should surface a specific, actionable message, not a generic crash or silent no-op.
- **Non-admin hitting the API route directly**: the broadcast route is a URL like any other — a `front_desk` or `specialist` account (or an unauthenticated request) must be rejected server-side, not just hidden from the UI.

---

## File Structure

- **Create:** `src/components/notifications/IntentHandler.tsx` — resolves `?intent=booking` against auth state.
- **Modify:** `src/app/layout.tsx` — mount `IntentHandler` (wrapped in `Suspense`, required by `useSearchParams`).
- **Modify:** `src/components/auth/LoginCard.tsx` — carry the current path+query through the OAuth `next` redirect.
- **Create:** `supabase/migrations/020_notification_broadcasts.sql` — the broadcast log table + RLS.
- **Create:** `src/lib/supabase/queries/notificationBroadcasts.ts` — recipient count + history queries.
- **Create:** `src/app/api/admin/notifications/broadcast/route.ts` — the actual send endpoint (server-only).
- **Create:** `src/components/admin/notifications/NotificationsManager.tsx` — compose form + confirm + history.
- **Create:** `src/app/admin/notifications/page.tsx` — server page wiring data into `NotificationsManager`.
- **Modify:** `src/components/admin/AdminSidebar.tsx` — add the "Notifications" nav item.
- **Modify:** `src/components/admin/dashboard/CommandCenter.tsx` — add the "Send Notification" quick action.

---

### Task 1: Deep-link intent handler + login redirect carry-through

**Files:**
- Create: `src/components/notifications/IntentHandler.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/auth/LoginCard.tsx:14-32`

**Interfaces:**
- Consumes: `useBooking()` from `@/components/booking/BookingContext` (`open(service: BookableService): Promise<void>`), `useLoginModal()` from `@/components/auth/LoginModalContext` (`open(): void`), `createClient()` from `@/lib/supabase/client`.
- Produces: no new exports consumed by later tasks — this is a self-contained, testable-on-its-own slice.

- [ ] **Step 1: Write `IntentHandler.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBooking } from "@/components/booking/BookingContext";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { createClient } from "@/lib/supabase/client";

const PLACEHOLDER_SERVICE = { name: "GlowSync Booking", duration: "", price: 0 };

export default function IntentHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openBooking } = useBooking();
  const { open: openLogin } = useLoginModal();

  useEffect(() => {
    const intent = searchParams.get("intent");
    if (intent !== "booking") return;

    const supabase = createClient();
    let cancelled = false;

    async function resolve() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!data.user) {
        openLogin();
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

Note the not-logged-in branch (`openLogin(); return;`) never touches the URL — this is what keeps `?intent=booking` in the address bar until the OAuth round trip is actually complete, which is the exact failure mode named first in Review Focus.

- [ ] **Step 2: Mount it in the root layout**

Edit `src/app/layout.tsx`. Current relevant block:

```tsx
        <LoginModalProvider>
          <BookingProvider>{children}</BookingProvider>
          <ChatWidgetWrapper />
        </LoginModalProvider>
```

Replace with (add the `Suspense` import from `"react"` alongside the existing imports, and the `IntentHandler` import):

```tsx
        <LoginModalProvider>
          <BookingProvider>
            {children}
            <Suspense fallback={null}>
              <IntentHandler />
            </Suspense>
          </BookingProvider>
          <ChatWidgetWrapper />
        </LoginModalProvider>
```

`IntentHandler` must be inside `BookingProvider` (it calls `useBooking()`) and inside `LoginModalProvider` (it calls `useLoginModal()`) — both already wrap `children` at this point in the tree, so this placement satisfies both. The `Suspense` boundary is required because `useSearchParams()` opts a component out of static rendering; without it Next.js throws a build-time error.

- [ ] **Step 3: Carry the current URL through OAuth login**

Edit `src/components/auth/LoginCard.tsx`, the `handleOAuth` function (lines 14-32). Replace:

```ts
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
```

with:

```ts
    const supabase = createClient();
    const nextUrl = `${window.location.pathname}${window.location.search}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextUrl)}`,
      },
    });
```

No changes needed to `src/app/auth/callback/route.ts` — it already reads `next` (defaulting to `/`) and redirects there after exchanging the code (confirmed during spec research).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `IntentHandler.tsx`, `layout.tsx`, or `LoginCard.tsx`.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors/warnings from the three touched files.

- [ ] **Step 6: Manual verification via the `run` skill**

1. Start the dev server, visit `/?intent=booking` while logged out. Confirm the Login modal opens and the URL still shows `?intent=booking` (it must NOT have been stripped).
2. Log in with Google or Facebook. Confirm you land back on `/?intent=booking`, the booking flow opens automatically within a moment, and the URL then updates to drop `?intent=booking`.
3. Log out. Visit `/?intent=booking` again, this time already logged in via email/password (`StaffLoginForm`) if you have a non-OAuth test account — otherwise log in via OAuth normally. Confirm the booking flow opens with no Login detour when already authenticated.
4. Click the existing "Book Now" button anywhere in the app while logged out (unrelated to `?intent=`). Log in. Confirm the booking flow now opens automatically afterward — this is the pre-existing gap the spec called out, now fixed as a side effect.

- [ ] **Step 7: Commit**

```bash
git add src/components/notifications/IntentHandler.tsx src/app/layout.tsx src/components/auth/LoginCard.tsx
git commit -m "feat: resolve ?intent=booking deep links, carry URL through OAuth login"
```

---

### Task 2: `notification_broadcasts` migration

**Files:**
- Create: `supabase/migrations/020_notification_broadcasts.sql`

**Interfaces:**
- Produces: `notification_broadcasts` table shaped `id (uuid), subject (text), message (text), link_path (text, default '/?intent=booking'), sent_by (uuid, fk -> profiles.id), recipient_count (integer, default 0), created_at (timestamptz)`.

- [ ] **Step 1: Write the migration**

```sql
-- 020_notification_broadcasts.sql
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

- [ ] **Step 2: Verify the file**

Run: `cat "supabase/migrations/020_notification_broadcasts.sql"` (or open it) and confirm it matches the block above — this file is applied by hand in the Supabase SQL editor, not by any tooling in this repo.

- [ ] **Step 3: Ask the user to apply it**

Tell the user: "Please run `supabase/migrations/020_notification_broadcasts.sql` in the Supabase SQL editor, then let me know." Task 4's route and Task 5's manual verification need this applied; Task 3 (query helper code) does not need it to compile.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/020_notification_broadcasts.sql
git commit -m "feat: add notification_broadcasts migration"
```

---

### Task 3: Query helper — `notificationBroadcasts.ts`

**Files:**
- Create: `src/lib/supabase/queries/notificationBroadcasts.ts`

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js` (same type used throughout `src/lib/supabase/queries/*`).
- Produces:
  - `type NotificationBroadcast = { id: string; subject: string; message: string; link_path: string; recipient_count: number; created_at: string; sent_by_name: string }`
  - `getEligibleRecipientCount(supabase): Promise<number>`
  - `getBroadcastHistory(supabase): Promise<NotificationBroadcast[]>`

- [ ] **Step 1: Write the module**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationBroadcast = {
  id: string;
  subject: string;
  message: string;
  link_path: string;
  recipient_count: number;
  created_at: string;
  sent_by_name: string;
};

type Rel<T> = T | T[] | null;

function one<T>(v: Rel<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function getEligibleRecipientCount(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "customer")
    .not("email", "is", null);

  if (error) {
    console.error("getEligibleRecipientCount failed:", error);
    return 0;
  }
  return count ?? 0;
}

type Row = {
  id: string;
  subject: string;
  message: string;
  link_path: string;
  recipient_count: number;
  created_at: string;
  sent_by: Rel<{ full_name: string }>;
};

export async function getBroadcastHistory(supabase: SupabaseClient): Promise<NotificationBroadcast[]> {
  const { data, error } = await supabase
    .from("notification_broadcasts")
    .select("id, subject, message, link_path, recipient_count, created_at, sent_by:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("getBroadcastHistory failed:", error);
    return [];
  }

  return ((data as unknown as Row[]) ?? []).map((row) => ({
    id: row.id,
    subject: row.subject,
    message: row.message,
    link_path: row.link_path,
    recipient_count: row.recipient_count,
    created_at: row.created_at,
    sent_by_name: one(row.sent_by)?.full_name ?? "Unknown",
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `notificationBroadcasts.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/queries/notificationBroadcasts.ts
git commit -m "feat: add notificationBroadcasts query helper"
```

---

### Task 4: Resend dependency + broadcast send route

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `src/app/api/admin/notifications/broadcast/route.ts`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server` (server-side, cookie-based — same pattern as `src/app/frontdesk/staff/page.tsx`'s role guard), `getEligibleRecipientCount` from Task 3 is NOT used here (the route re-queries recipients directly to get their emails, which the count-only helper doesn't provide).
- Produces: `POST /api/admin/notifications/broadcast` accepting `{ subject: string, message: string }`, returning `{ sentCount: number, totalRecipients: number }` on success or `{ error: string }` with a non-200 status on failure.

- [ ] **Step 1: Install the Resend SDK**

Run: `npm install resend`
Expected: `package.json` and `package-lock.json` gain the `resend` dependency.

- [ ] **Step 2: Add the env vars to `.env.local.example` (or note them if no example file exists)**

Run: `ls .env.local.example 2>/dev/null || echo "no example file"` to check first.

If an example env file exists, append:

```
RESEND_API_KEY=
RESEND_FROM_EMAIL=GlowSync <onboarding@resend.dev>
```

If no example file exists in this repo, skip this step — just note in the commit message that these two env vars are required (`RESEND_API_KEY` is the user's real key; `RESEND_FROM_EMAIL` defaults to Resend's shared test sender so sending works immediately without a verified domain, and the user can swap it once they verify their own domain in Resend).

- [ ] **Step 3: Write the route**

```ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const BRAND_COLOR = "#C9A84A";

function buildEmailHtml(subject: string, message: string, linkUrl: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 22px; font-weight: 700; color: #2b1a16; font-style: italic;">Blush Spa &amp; Aesthetics</p>
      <h1 style="font-size: 18px; color: #2b1a16;">${subject}</h1>
      <p style="font-size: 14px; color: #2b1a16; line-height: 1.6; white-space: pre-wrap;">${message}</p>
      <a href="${linkUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: ${BRAND_COLOR}; color: white; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Book Now
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "customer")
    .not("email", "is", null);

  if (recipientsError) {
    return NextResponse.json({ error: recipientsError.message }, { status: 500 });
  }

  const emails = ((recipients as { email: string }[]) ?? []).map((r) => r.email);
  if (emails.length === 0) {
    return NextResponse.json({ error: "No eligible recipients." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Email sending isn't set up yet — add RESEND_API_KEY to continue." },
      { status: 500 }
    );
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "GlowSync <onboarding@resend.dev>";
  const origin = new URL(request.url).origin;
  const linkUrl = `${origin}/?intent=booking`;
  const html = buildEmailHtml(subject, message, linkUrl);

  let sentCount = 0;
  const CHUNK_SIZE = 100;
  for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
    const chunk = emails.slice(i, i + CHUNK_SIZE);
    const { data: batchResult, error: sendError } = await resend.batch.send(
      chunk.map((to) => ({ from, to, subject, html }))
    );
    if (sendError) {
      console.error("Resend batch send failed:", sendError);
      continue;
    }
    sentCount += batchResult?.data?.length ?? 0;
  }

  await supabase.from("notification_broadcasts").insert({
    subject,
    message,
    link_path: "/?intent=booking",
    sent_by: auth.user.id,
    recipient_count: sentCount,
  });

  return NextResponse.json({ sentCount, totalRecipients: emails.length });
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from the new route file. If `resend` types aren't found, re-run `npm install resend` and try again.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors from the route file.

- [ ] **Step 6: Manual verification — reject non-admin/unauthenticated requests**

Run (adjust the URL if the dev server runs on a different port):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/notifications/broadcast -H "Content-Type: application/json" -d '{"subject":"test","message":"test"}'
```

Expected: `403` — an unauthenticated request (no session cookie) is rejected before it ever queries recipients or touches Resend. This is the Review Focus item about the route being reachable directly, not just hidden behind the UI: the role check happens in the route itself (lines checking `profile.role !== "admin"`), not only in the page component from Task 5.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/app/api/admin/notifications/broadcast/route.ts
git commit -m "feat: add broadcast email send route"
```

---

### Task 5: Admin Notifications page

**Files:**
- Create: `src/components/admin/notifications/NotificationsManager.tsx`
- Create: `src/app/admin/notifications/page.tsx`

**Interfaces:**
- Consumes: `getEligibleRecipientCount`, `getBroadcastHistory`, `type NotificationBroadcast` from Task 3; `POST /api/admin/notifications/broadcast` from Task 4.
- Produces: `NotificationsManager({ initialRecipientCount: number; initialHistory: NotificationBroadcast[] })` — default export, client component.

- [ ] **Step 1: Write `NotificationsManager.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import type { NotificationBroadcast } from "@/lib/supabase/queries/notificationBroadcasts";

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

export default function NotificationsManager({
  initialRecipientCount,
  initialHistory,
}: {
  initialRecipientCount: number;
  initialHistory: NotificationBroadcast[];
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState(initialHistory);

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/admin/notifications/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });
    const data = await res.json();
    setSending(false);
    setConfirming(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to send.");
      return;
    }

    setResult(
      data.sentCount < data.totalRecipients
        ? `Sent to ${data.sentCount} of ${data.totalRecipients} — some deliveries failed.`
        : `Sent to ${data.sentCount} client${data.sentCount === 1 ? "" : "s"}.`
    );
    setHistory((prev) => [
      {
        id: crypto.randomUUID(),
        subject,
        message,
        link_path: "/?intent=booking",
        recipient_count: data.sentCount,
        created_at: new Date().toISOString(),
        sent_by_name: "You",
      },
      ...prev,
    ]);
    setSubject("");
    setMessage("");
  }

  const canSend = subject.trim().length > 0 && message.trim().length > 0 && initialRecipientCount > 0;

  return (
    <div className="space-y-6">
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

          <p className="text-sm text-ink/50">
            {initialRecipientCount === 0
              ? "No eligible recipients yet."
              : `This will send to ${initialRecipientCount} client${initialRecipientCount === 1 ? "" : "s"}.`}
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
            history.map((h) => (
              <div key={h.id} className="py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{h.subject}</p>
                  <span className="text-xs text-ink/40">{formatRelative(h.created_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink/50">
                  {h.sent_by_name} · {h.recipient_count} recipient{h.recipient_count === 1 ? "" : "s"}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="font-semibold text-ink">Send this broadcast?</h2>
            <p className="mt-2 text-sm text-ink/60">
              This sends <span className="font-medium text-ink">&ldquo;{subject}&rdquo;</span> to{" "}
              <span className="font-medium text-ink">{initialRecipientCount}</span> client
              {initialRecipientCount === 1 ? "" : "s"} right now. This can&apos;t be undone.
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

- [ ] **Step 2: Write `page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEligibleRecipientCount, getBroadcastHistory } from "@/lib/supabase/queries/notificationBroadcasts";
import NotificationsManager from "@/components/admin/notifications/NotificationsManager";

export default async function AdminNotificationsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.role !== "admin") redirect("/admin");

  const [recipientCount, history] = await Promise.all([
    getEligibleRecipientCount(supabase),
    getBroadcastHistory(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Notifications</h1>
        <p className="text-sm text-ink/50">Send an announcement to every client by email.</p>
      </div>
      <NotificationsManager initialRecipientCount={recipientCount} initialHistory={history} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from either new file.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Manual verification via the `run` skill** (requires Task 2's migration applied and `RESEND_API_KEY` set)

1. Visit `/admin/notifications` directly as a non-admin (or logged out) — confirm redirect, not a crash.
2. As admin, visit the page. Confirm the recipient count matches the real number of customer profiles with an email (cross-check with the count from Task 2/3 verification).
3. Leave Subject or Message empty — confirm Send stays disabled. Also inspect `canSend` in `NotificationsManager.tsx`: it requires `initialRecipientCount > 0`, and the server route independently rejects `emails.length === 0` with 400 — with 7 real customer profiles already in this database (confirmed during spec research), genuinely emptying recipients to test this live isn't practical, so this one is verified by code inspection rather than a live run: both the client-side gate and the server-side rejection exist and agree.
4. Fill both in, click Send, confirm the confirmation dialog names the exact subject and recipient count.
5. Confirm the send. Check the target inbox for the actual email — correct subject, message, branding, and a working "Book Now" link.
6. Confirm the new broadcast appears at the top of the history list immediately, with the right recipient count.
7. Temporarily unset `RESEND_API_KEY`, restart the dev server, try sending again — confirm the specific "Email sending isn't set up yet" message appears, not a generic error. Restore the env var afterward.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/notifications/NotificationsManager.tsx src/app/admin/notifications/page.tsx
git commit -m "feat: add admin Notifications page"
```

---

### Task 6: Wire up entry points — sidebar nav + Dashboard quick action

**Files:**
- Modify: `src/components/admin/AdminSidebar.tsx:5-25`
- Modify: `src/components/admin/dashboard/CommandCenter.tsx:5,11-15`

**Interfaces:**
- Consumes: the `/admin/notifications` route from Task 5.
- Produces: no new exports.

- [ ] **Step 1: Add the sidebar nav item**

Edit `src/components/admin/AdminSidebar.tsx`. Add `Bell` to the existing `lucide-react` import (line 5-14):

```ts
import {
  Bell,
  Building2,
  CalendarCheck,
  ChevronLeft,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
```

Add a new entry to `navItems` (line 18-25), after `"Reports & System Settings"`:

```ts
const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users & Roles", icon: Users },
  { href: "/admin/bookings", label: "Bookings Management", icon: CalendarCheck },
  { href: "/admin/payments", label: "Payments & Financials", icon: Wallet },
  { href: "/admin/branches", label: "Branches & Services", icon: Building2 },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/reports", label: "Reports & System Settings", icon: Settings },
];
```

- [ ] **Step 2: Add the Dashboard quick action**

Edit `src/components/admin/dashboard/CommandCenter.tsx`. Add `Bell` to the existing import (line 5):

```ts
import { Bell, Building2, ClipboardList, UserPlus } from "lucide-react";
```

Add a fourth entry to `actions` (line 11-15):

```ts
  const actions = [
    { label: "Add Branch", icon: Building2, href: "/admin/branches", onClick: null },
    { label: "Manage Staff", icon: UserPlus, href: null, onClick: null },
    { label: "Add Menu", icon: ClipboardList, href: null, onClick: () => setShowAddMenu(true) },
    { label: "Send Notification", icon: Bell, href: "/admin/notifications", onClick: null },
  ];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from either file.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Manual verification via the `run` skill**

1. As admin, confirm "Notifications" appears in the sidebar between "Branches & Services" and "Reports & System Settings," and navigating to it loads the page from Task 5.
2. On the Dashboard, confirm "Send Notification" appears as a fourth quick action alongside "Add Branch," "Manage Staff," "Add Menu," and clicking it navigates to `/admin/notifications`.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/AdminSidebar.tsx src/components/admin/dashboard/CommandCenter.tsx
git commit -m "feat: add Notifications entry points to admin sidebar and dashboard"
```
