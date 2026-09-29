# Visit Reviews, Staff Profiles & Review Moderation — Design Spec

Date: 2026-09-30
Status: Approved in chat section by section (2026-09-30); awaiting written-spec review

## Purpose

After a completed appointment, a client rates their visit — the service,
the therapist who served them, and optionally the branch — once per
appointment. Staff ratings appear on public staff profiles and in the
Admin / Front Desk staff panels. Admins moderate every review from a
dedicated Reviews page, with an audit trail. Abusive language (English,
Tagalog, Bisaya/Cebuano) is blocked at submission; honest negative
feedback is not. Hiding a review updates every place it appears.

This is sub-project **A** of the user's request. Sub-project **B**
(follow-up sessions + reminders) is a separate spec/plan cycle after A.

## Decisions (from the chat)

| Topic | Decision |
|---|---|
| Order | Reviews (A) first, Follow-up sessions (B) after |
| Staff rating display | Both: public `/team/<id>` pages + Admin/Front Desk staff panels |
| Review form | One "Rate your visit" form per completed appointment: Service, Staff, Branch (branch optional) |
| Publication | Visible immediately; admin can hide/remove later (post-moderation) |
| Profanity languages | English + Tagalog + Bisaya/Cebuano |
| Data model | Extend `reviews`: one row per target (service/staff/branch) per appointment |
| Client-side word check | None — the database function is the single source of truth |

## Current state

- `reviews` (schema.sql): `id, branch_id, client_id, rating 1–5, text, created_at`.
  - 012 added `professional_id → professionals(id)` and a unique
    `(client_id, professional_id)` — one therapist review per client ever.
    **Bug:** staff live in `staff_members` since 031; this FK points at
    the legacy table, so therapist reviews are broken or mislabelled.
  - 046 added `appointment_id` + unique `(client_id, appointment_id)` —
    used by My Services' per-visit service review.
  - RLS: `public read reviews` (all rows); `clients create reviews`
    (insert where `client_id = auth.uid()`).
- Client UI: `MyServicesList.tsx` (per-visit service review),
  `ReviewsPanel.tsx` (separate therapist + branch forms, "My Reviews").
  Queries in `src/lib/supabase/queries/myGlow.ts`
  (`getServiceReviews`, `submitServiceReview`,
  `getReviewableProfessionals`, `getMyReviews`, `submitReview`).
- Admin: Reports "Client Reviews" card via `getReviewsSummary`
  (`src/lib/supabase/queries/reports.ts:357`) — counts every row.
- "Completed" today (My Services): `status = 'completed'` or
  `session_status in ('completed','paid')`.
- Home `Reviews.tsx`, About `Testimonials.tsx`, and home `Team.tsx` are
  **hard-coded** from `src/lib/data.ts`; not DB-backed.
- `staff_members`: `id, full_name, department, branch_id, phone,
  avatar_url, created_at, shift_type`. No active flag.
- No admin reviews page, no statuses, no moderation log, no word filter.

## 1. Data model (migration `048_review_moderation.sql`)

### `reviews` — new columns

| Column | Type | Notes |
|---|---|---|
| `target_type` | `text not null` check in (`service`,`staff`,`branch`) | backfilled (below) |
| `staff_id` | `uuid references staff_members(id) on delete set null` | replaces `professional_id` for new rows |
| `service_id` | `uuid references branch_services(id) on delete set null` | from the appointment |
| `status` | `text not null default 'visible'` check in (`visible`,`hidden`,`removed`) | |
| `status_changed_at` | `timestamptz` | |
| `status_changed_by` | `uuid references profiles(id) on delete set null` | |
| `admin_seen_at` | `timestamptz` | null = "new" |

Constraints / indexes:
- Drop `reviews_client_professional_uniq` (one-per-therapist-ever).
- Drop `reviews_client_appointment_uniq`; add unique
  `(appointment_id, target_type) where appointment_id is not null`.
- Replace `reviews_target_check` with: `service` → `appointment_id` not
  null; `staff` → `appointment_id` not null for new rows (legacy staff rows
  may lack it — see backfill, enforced as `not valid`); `branch` →
  `branch_id` not null.
- Indexes on `(target_type, status, created_at desc)`, `staff_id`,
  `service_id`, `branch_id`.

### Backfill of existing rows

- `appointment_id is not null` → `target_type = 'service'`;
  `service_id` from the appointment.
- `professional_id is not null` → `target_type = 'staff'`; `staff_id` =
  the `staff_members` row whose `full_name` equals the legacy
  `professionals.name` (case-insensitive, trimmed); unmatched → `staff_id`
  null (kept, shown in admin, not on any public page).
- Otherwise (`branch_id` only) → `target_type = 'branch'`.
- All existing rows `status = 'visible'`, `admin_seen_at = now()`.
- `professional_id` column is kept (read-only, legacy) — not dropped.

### `blocked_review_terms`

`id, term text unique (normalized form), language text check in
('en','tl','ceb'), category text check in ('abusive','sexual','threat',
'discriminatory'), created_at`. RLS: admin select/insert/update/delete
only. Seeded by the migration with a curated list per language. Terms
that express legitimate dissatisfaction (bad, terrible, rude, worst,
rushed, dirty, pangit, bati, etc.) are **never** seeded.

### `review_moderation_log`

`id, review_id → reviews(id) on delete cascade, action text check in
('hide','show','remove','restore'), from_status, to_status, reason text,
actor_id → profiles(id), created_at`. RLS: admin select only; no insert
/update/delete policies — rows are written only by the moderation
function.

### RLS changes on `reviews`

- Drop `clients create reviews` (direct inserts). Inserts only via
  `submit_visit_review`.
- Replace `public read reviews` with: `status = 'visible'` for everyone,
  **or** `client_id = auth.uid()` (a client sees their own, any status),
  **or** caller is admin/front_desk (all rows).
- No update/delete policies for non-admins. Admin updates go through
  `moderate_review`.

### Realtime

`alter publication supabase_realtime add table reviews` (guarded).

## 2. Submission — `submit_visit_review` (SECURITY DEFINER)

```
submit_visit_review(
  p_appointment_id uuid,
  p_service_rating smallint, p_service_text text,
  p_staff_rating smallint,   p_staff_text text,   -- nullable
  p_branch_rating smallint,  p_branch_text text   -- nullable
) returns void
```

In one transaction, raising an exception with a stable code (message is
the client-facing text) when:
- caller not signed in, or the appointment's `client_id <> auth.uid()`,
  or not completed (`status = 'completed'` or `session_status in
  ('completed','paid')`) → `REVIEW_NOT_ALLOWED` "You can only review
  completed visits."
- any review already exists for the appointment → `REVIEW_DUPLICATE`
  "You've already reviewed this visit." (the unique index is the backstop
  for races)
- `p_service_rating` null or any given rating outside 1–5, or any text
  over 1000 chars (after cleaning) → `REVIEW_INVALID`
- any text fails `review_text_is_clean` → `REVIEW_INAPPROPRIATE`
  "Please keep your review respectful and appropriate."

Then inserts: a `service` row (always); a `staff` row if a staff rating
was given **and** the appointment has `professional_id` (→ `staff_id`);
a `branch` row if a branch rating was given (→ appointment's
`branch_id`). Each row: `client_id = auth.uid()`, `appointment_id`,
`service_id`, `branch_id`, `status = 'visible'`, cleaned text.

`search_path = public, pg_temp`; execute revoked from `anon`, granted to
`authenticated`.

### Text cleaning — `clean_review_text(text) returns text` (immutable)

Strip HTML tags (`<[^>]*>`), strip control characters except newline,
collapse runs of whitespace, trim; empty → null.

### Word check — `review_text_is_clean(text) returns boolean` (stable, SECURITY DEFINER)

1. Lowercase; map look-alikes `1→i 3→e 0→o 4→a @→a $→s 5→s 7→t`.
2. Remove in-word obfuscation: characters `* . _ - ~` between letters.
3. Squash any letter repeated 3+ times to one (`fuuuck` → `fuck`).
4. Tokenize on non-letters; a term matches if it equals a token
   (**whole word**), or the concatenation of consecutive single-letter
   tokens (spaced-out `f u c k`).
5. Multi-word terms match as a token sequence.
Returns false on any match. Never reveals which term matched.

## 3. Moderation — `moderate_review` (SECURITY DEFINER)

```
moderate_review(p_review_id uuid, p_action text, p_reason text) returns void
```
Caller must be admin (else `REVIEW_FORBIDDEN`). Allowed transitions:
`hide` visible→hidden, `show` hidden→visible, `remove` visible|hidden→
removed, `restore` removed→visible. Invalid transition → exception,
nothing written. Updates `status`, `status_changed_at/by`,
`admin_seen_at = coalesce(admin_seen_at, now())`, and inserts one
`review_moderation_log` row — atomically.

`mark_reviews_seen(p_ids uuid[])` (admin only) sets `admin_seen_at` for
unseen rows.

Nothing is ever hard-deleted by the app.

## 4. Client UI

### My Glow → My Services (`MyServicesList.tsx`)
- Completed + unreviewed visit → **Rate your visit** button → inline form:
  Service ★ (required) + comment; **Your therapist — {name}** ★ + comment
  (only if the appointment has a therapist); **Branch — {name}** ★ +
  comment. Submit calls the RPC; error codes map to the messages above;
  the form keeps its content on error. `REVIEW_DUPLICATE` triggers a
  refetch.
- Reviewed visit → shows each part's stars and comment; a hidden/removed
  part shows *"Hidden by the spa"* in place of its text.
- Subscribes to Realtime changes on the client's own reviews.

### My Glow → Reviews panel (`ReviewsPanel.tsx`)
- Remove the separate therapist and branch "Write a Review" forms.
  Replace with a note: *"Rate your completed visits in My Services."*
- **My Reviews** list: each row shows type, target name, stars, text,
  date, and status (Visible / Hidden by the spa).

Obsolete query helpers (`getReviewableProfessionals`, `submitReview`,
`submitServiceReview`) are removed; `getServiceReviews` and
`getMyReviews` are rewritten for the new columns.

## 5. Staff profiles

### Public
- Home **Teams** section (`Team.tsx`): reads `staff_members` (all rows)
  with branch name and rating summary (average of visible `staff` reviews,
  count). Card: avatar (or initial), name, department, branch, ★ avg ·
  N reviews (or "No reviews yet"). Each links to `/team/<id>`.
- New page `src/app/team/[id]/page.tsx` (dynamic): photo, name,
  department, branch, overall rating, 5→1 star breakdown, visible staff
  reviews newest first (stars, text, reviewer "First L.", date). Unknown
  id → `notFound()`.
- Public pages read only through a new view `public_staff_profiles`
  (`id, full_name, department, branch_id, avatar_url` — no phone), never
  `staff_members` directly. Note: `staff_members` is currently readable by
  anonymous users **including `phone`** (verified 2026-09-30 via the anon
  key). Tightening that policy is a pre-existing issue, out of scope here
  (listed in §11), because booking and front-desk flows read the table.

### Staff panels
- Admin `StaffMembersPanel.tsx` detail and Front Desk
  `StaffDetailPanel.tsx`: a **Rating** block — average, count, latest 5
  reviews (all statuses, with status badge), and "View all reviews" →
  `/admin/reviews?staff=<id>` (admin only; front desk sees the block
  without the link).

## 6. Admin Reviews page

- Sidebar entry **Reviews** (`Star` icon) → `src/app/admin/reviews/page.tsx`
  (server: admin guard, initial data) + `ReviewsManager.tsx` (client).
- Summary: average service / staff / branch rating (visible only);
  counts of New, Hidden, Removed.
- Tabs All / Service / Staff / Branch. Filters: service, staff, branch,
  rating, date range, status (visible/hidden/removed/new), text search.
  Filters are reflected in the URL query so links like
  `?staff=<id>` work. Paginated 25 per page.
- Row: stars, type badge, target name, snippet, client name, date,
  status badge, "New" highlight.
- Detail panel: full text; client; appointment (date/time, service,
  therapist, branch, booking code) with link to the booking in
  `/admin/bookings`; sibling reviews from the same visit; moderation
  history. Opening calls `mark_reviews_seen`.
- Actions: Hide / Show / Remove / Restore with optional reason (confirm
  dialog for Remove). Buttons disabled while pending; errors toast and
  leave state unchanged.
- Realtime subscription on `reviews` keeps the list current.
- Admin dashboard: "New reviews: N" linking to `/admin/reviews?status=new`.

## 7. Reports & other consumers

- `getReviewsSummary` counts only `status = 'visible'`, adds per-type
  averages, and the Reports card links to `/admin/reviews`.
- Any other `reviews` read in the app is updated to filter visible where
  shown publicly (checked by grep during planning).
- Hard-coded home `Reviews.tsx` / About `Testimonials.tsx` are out of
  scope and unchanged.

## 8. Safe text

- Stored text is cleaned (§2). All review text is rendered as React text
  nodes; no `dangerouslySetInnerHTML` for review content (verified by a
  grep step in the plan). Any future email including review text must
  HTML-escape it.

## 9. Error handling

| Situation | Behaviour |
|---|---|
| Blocked word | "Please keep your review respectful and appropriate." — nothing saved, form kept |
| Duplicate (double submit / two tabs) | "You've already reviewed this visit." + refetch |
| Not completed / not yours | "You can only review completed visits." |
| Network / DB error | "Couldn't submit your review. Please try again." — atomic, nothing partial |
| Staff member deleted | `staff_id` set null; reviews stay in admin/Reports; public page 404 |
| Admin action fails / invalid transition | Toast; status unchanged; no log row |
| Non-admin calls moderation RPC | Rejected (`REVIEW_FORBIDDEN`) |

## 10. Testing

- **SQL verification script** `supabase/tests/048_reviews_check.sql`, run
  once by the user in a rolled-back transaction, asserting:
  completed vs not-completed, foreign appointment, duplicate submit,
  per-language blocked words, obfuscations (`f*ck`, `sh1t`, `f u c k`,
  `fuuuck`), innocent embeds (`class`, `assessment`, `Scunthorpe`),
  honest negatives ("terrible, rushed, rude staff" passes), HTML
  stripping, every moderation transition writing one log row, invalid
  transitions rejected, anon sees only visible rows.
- **Vitest** for pure display helpers: reviewer display name ("Ana D."),
  average/count/breakdown computation, error-code → message mapping.
- **Manual**: rate a visit → appears on `/team/<id>` and Reports → hide
  in admin → gone from staff page and Reports, client sees "Hidden by the
  spa" → restore → back everywhere; two admin tabs update live.

## 11. Out of scope

- Follow-up sessions (sub-project B).
- Editing a submitted review.
- Admin UI to edit the blocked-terms list (managed via SQL for now).
- Replacing hard-coded home reviews/testimonials with DB reviews.
- Replying to reviews.
- **Follow-up (pre-existing):** anonymous read access to
  `staff_members.phone`; and the open `appointment_history` insert policy
  noted in the Messenger spec.
