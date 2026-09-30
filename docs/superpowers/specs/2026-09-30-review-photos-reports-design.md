# Review Photos, Service Pages, Edits & Reports — Design Spec

Date: 2026-09-30
Status: Approved in chat section by section (2026-09-30); awaiting written-spec review
Builds on: `2026-09-30-reviews-moderation-design.md` (migration 048)

## Purpose

Extend GlowSync's visit reviews into a complete, TikTok-Shop-style review
flow: after a completed booking the client is asked to rate it, rates each
booked service (with photos), the therapist and optionally the branch, can
edit for 30 days, and sees the result on new public service pages and the
therapist pages. Other clients can report abusive reviews; Admin moderates
with a Flagged queue, filters and search. Every review stays tied to a
real completed booking ("Verified Service").

## Decisions (from the chat)

| Topic | Decision |
|---|---|
| Form shape | Keep three parts: Service, Therapist, Branch (optional) |
| Multi-service bookings | One service part **per booked service** (stars, comment, photos each) |
| Photos | Service parts only; up to 5 per service part; shown on service pages only |
| Editing | Allowed for 30 days after first submission; shows "Edited" |
| Reports | First report → **Flagged**, stays visible until Admin decides |
| Service page scope | Only One Cecilia Center's service rows (the branch the Services page lists) |
| Review request | In-app bell + Messenger (utility template) when a booking is completed |
| Photo storage | Private bucket; short-lived signed URLs only for publicly shown reviews |
| Entry points | My Glow → My Services (completed visits), bell/Messenger link, service page box |

## Current state (after 048/049, both not yet applied to the live DB)

- `reviews`: `target_type` service/staff/branch, `staff_id`, `service_id`
  (→ `branch_services`), `status` visible/hidden/removed, moderation
  columns, `admin_seen_at`. Unique `(appointment_id, target_type)`.
- `submit_visit_review(appt, service rating/text, staff rating/text,
  branch rating/text)` — one service part per visit, uses
  `appointments.service_id`.
- **Gap:** online bookings (`BookingModal.tsx:641`) never set
  `appointments.service_id`; services are stored only as text in
  `notes` ("Facial, Eyebrow with Maria — ₱1,150.00"). Walk-ins
  (`walkins.ts`) do set `service_id`. A booking can hold several services.
- Public: `/services` lists One Cecilia Center `branch_services` cards;
  no service detail page. `/team/[id]` shows staff reviews via
  `public_staff_reviews`.
- Client: `MyServicesList.tsx` (per-visit review form + read-only view),
  `ReviewsPanel.tsx` (My Reviews). Admin: `ReviewsManager`,
  `ReviewDetailPanel`, `NewReviewsCard`; moderation via
  `moderate_review` RPC from `adminReviews.ts`.
- Bell: `client_notifications` (049) kinds `confirmed`/`cancelled`,
  created by trigger `notify_client_booking_status`.
- Messenger (047): `messenger_outbox` kinds reminder/appointment_update/
  promo/booking_invite; utility templates in `src/lib/messenger/templates.ts`.

## 1. Data — migration `051_review_photos_reports.sql` (requires 048, 049)

### Booked services
- New table `appointment_services (appointment_id uuid → appointments on
  delete cascade, position smallint, service_id uuid → branch_services on
  delete set null, service_name text not null, primary key
  (appointment_id, position))`. `service_name` keeps the booked name even
  when no `branch_services` row matched.
  RLS: client reads own appointment's rows; staff read all; a client may
  insert rows only for their own appointment whose status is pending or
  confirmed and that has no rows yet (the booking form, right after
  creating it). No client update/delete.
- `BookingModal` inserts one row per selected service right after the
  appointment insert. (Walk-ins have no client account, so they are never
  reviewed and need no rows; the backfill covers their `service_id`.)
- **Backfill:** for existing appointments with no rows: use
  `service_id` if set; else split the `notes` text before `" with "` on
  `", "` and match each name case-insensitively to that branch's
  `branch_services.name`. Unmatched names are skipped (those visits can
  still review therapist/branch; service part shows the text name and is
  stored with `service_id` null — never on a service page).

### Reviews
- New column `service_position smallint` (service parts only; = the
  `appointment_services.position` reviewed; 0 for existing service rows).
  Unique index becomes: service parts unique on
  `(appointment_id, service_position)`; staff and branch parts unique on
  `(appointment_id, target_type)`.
- `status` check adds `flagged`: visible · flagged · hidden · removed.
  Public visibility = `status in ('visible','flagged')` (RLS "read
  reviews", `public_staff_reviews`, all aggregates).
- New columns: `edited_at timestamptz`, `first_submitted_at timestamptz`
  (= created_at for existing rows).

### Photos
- Private storage bucket `review-photos` (created by the migration,
  `public = false`). Path: `<client_id>/<appointment_id>/<uuid>.jpg`.
- Storage policies: a client may insert/delete objects only under
  `<auth.uid()>/`; select only own folder. No public read.
- Table `review_photos (id, review_id → reviews on delete cascade,
  storage_path text unique, position smallint 0–4, created_at)`;
  only for `target_type = 'service'`; max 5 per review (checked in
  function). RLS: owner and staff read; no direct writes.

### Functions (SECURITY DEFINER, error codes as in 048)
- `submit_visit_review(p_appointment_id, p_services jsonb, p_staff_rating,
  p_staff_text, p_branch_rating, p_branch_text)` — replaces the 048
  signature. `p_services` = array of `{position, rating, text,
  photos: [storage_path…]}` covering **every** `appointment_services`
  position of that booking (each needs a rating 1–5); `service_id` is
  taken from `appointment_services`, never from the client. A booking
  with no `appointment_services` rows gets one service part at position
  0 using `appointments.service_id` (may be null). Checks as 048 (owner, completed, not
  reviewed, lengths, word filter) plus: each photo path starts with
  `<uid>/<appointment_id>/`, exists in `storage.objects` bucket
  `review-photos`, ≤ 5 per service. Inserts reviews + review_photos.
- `edit_visit_review(same params)` — owner only; allowed while
  `now() < first_submitted_at + 30 days` and no part is hidden/removed
  (`REVIEW_LOCKED`, `REVIEW_EDIT_EXPIRED`). Updates rating/text, replaces
  photo rows, sets `edited_at`. Flagged stays flagged. Returns removed
  storage paths so the client deletes those files.
- `report_review(p_review_id, p_reason, p_note)` — signed-in, not own
  review, review publicly visible, reason in (`spam`, `offensive`,
  `inappropriate_photo`, `fake`, `other`), note ≤ 500 chars after
  cleaning. Table `review_reports (id, review_id, reporter_id, reason,
  note, created_at, unique (review_id, reporter_id))` → `REVIEW_REPORTED`
  on duplicate. First report moves visible → flagged (logged in
  `review_moderation_log` with actor = reporter, action `flag`).
- `moderate_review` gains action `keep` (flagged → visible). After a
  successful `remove`, the admin UI calls an admin API route (service
  role) that deletes the review's photo files and rows.
- Public read model (view, owner privileges, safe columns only):
  `public_service_reviews` (service parts: id, service_id, rating, text,
  created_at, edited_at, reviewer "Maria C.", staff_id, staff name,
  service date, photo count); service pages only query One Cecilia Center
  service ids. `public_staff_reviews` gains service name + service date +
  edited_at. Averages and star counts are computed in the app from these
  views (as the therapist pages already do).

### Review request notification
- `client_notifications.kind` adds `review_request`; the 049 trigger
  also fires when a booking becomes completed (`status = completed` or
  `session_status in (completed, paid)`), once per appointment, skipped
  if already reviewed. Title "How was your GlowSync experience?", body
  "Your <services> with <therapist> has been completed.", link
  `/my-glow?review=<appointment_id>`. Fires even for the client's own
  action (completion is a staff action anyway).
- Messenger: outbox kind `review_request` + utility template
  `glowsync_visit_review`: "Hi {{1}}, your {{2}} at {{3}} is complete.
  Tap below to rate your visit." Button "Rate your visit". Created by
  `scripts/messenger-setup.ts`; if Meta rejects/re-categorises it, the
  dispatcher skips (`template_unavailable`) and the bell still works.

## 2. Client screens

### Review form (modal; `VisitReviewForm`)
- Header: services, therapist, branch, date, "Verified Service".
- One **Service** block per booked service: "How was your <service>?",
  5 stars with label (Poor…Excellent), comment (≤ 1000, placeholder
  "Tell us about your service experience…"), **+ Add Photos** (up to 5;
  JPG/JPEG/PNG/WebP ≤ 5 MB each; resized in the browser to max 1600px,
  JPEG ~0.85; thumbnails with ✕; wrong type/size → message, not added).
- **Your therapist** (hidden if none) and **The branch (optional)**.
- Submit disabled until every service block has stars. Progress
  "Uploading photos 2/4…" → "Thank you for your review! Your review has
  been added to GlowSync."
- Errors: word filter → the existing 048 message "Please keep your review
  respectful and appropriate."; any
  failure keeps text/photos in the form; photos uploaded before a failed
  submit are deleted.
- Edit mode: same form, prefilled, shows "Edited reviews show an Edited
  label"; removed photos' files deleted after a successful save.

### My Glow → My Services (completed visits)
- Not reviewed → ⭐ **Rate & Review**.
- Reviewed → stars + **Reviewed ✓**, **View My Review** (read-only),
  **Edit Review** while within 30 days.
- Any part hidden/removed → "Part of this review was hidden by
  GlowSync"; no edit.
- `/my-glow?review=<id>` opens that visit's form (or View My Review).

### My Glow → My Reviews
- List: target name, stars, comment excerpt, photo thumbnails, date,
  "Edited", **View Review**.

## 3. Public pages

### Services list
- Each card: "★ 4.8 (126)" or "No reviews yet"; name links to
  `/services/<id>`. Book Now unchanged.

### `/services/[id]` (new; One Cecilia Center services only; 404 otherwise)
- Top: name, stars, count, duration, category, description, price,
  **Book Now** (opens the existing booking form exactly like the
  Services card button does).
- **Customer Reviews**: average, "Based on N reviews", 5→1 bars;
  filters All · 5★ · 4★ · 3★ · 2★ · 1★ · With Photos; cards (reviewer
  "Maria C.", stars, Verified Service, date, Edited, comment, photos,
  therapist name → `/team/<id>`, ⋯ Report Review); **Load More** (10).
- **Photos from Clients** strip → lightbox with ← → and "View review".
- "You've booked this service before" box when the signed-in client has
  an unreviewed completed visit that includes this service.
- Photos: server generates signed URLs (1 h) with the service role only
  for reviews returned by the public views.

### `/team/[id]`
- Summary 4.9 ★, count, 5→1 bars; review cards with service name +
  date, Edited, Report Review, Load More. No photos.

### Report Review modal
- Reason radio + optional note → "Thanks — our team will check it."
  Signed-out → sign-in prompt. Duplicate → "You already reported this."

## 4. Admin

- Reviews page tabs: All · **Flagged (n)** · Visible · Hidden · Removed.
- Filters: branch, service, staff, stars, With Photos; search (comment,
  client name). Row: client, target, stars, excerpt, photo count,
  status, report count.
- Detail panel: full comment, photos (signed URLs, enlarge), booking link
  + date, reports list (reason, note, reporter, time), history log.
- Actions: **Keep** (flagged → visible), **Hide** (reason), **Restore**,
  **Remove** (reason; deletes photo files). All logged. Nothing is
  auto-removed for being negative.
- Dashboard "New Reviews" card also counts flagged reviews.

## 5. Error handling

| Situation | Behaviour |
|---|---|
| Not owner / not completed / already reviewed | Form not offered; function raises `REVIEW_NOT_ALLOWED` / `REVIEW_DUPLICATE` |
| Edit after 30 days / hidden part | `REVIEW_EDIT_EXPIRED` / `REVIEW_LOCKED`; UI hides Edit |
| Photo not in own folder / missing / > 5 | `REVIEW_BAD_PHOTO`; nothing saved |
| Photo upload fails | Review not submitted; uploaded files cleaned up; form kept |
| Duplicate report / own review | `REVIEW_REPORTED` / `REVIEW_NOT_ALLOWED` |
| Messenger template unavailable | Skipped; bell notification still created |
| 051 not applied | New queries log via `logQueryError` (not-migrated warning); pages degrade to "No reviews yet" |

## 6. Testing

- Vitest: photo validation + resize dimensions, star filter + "With
  Photos" filtering, reviewer display name, 30-day edit window helper,
  notes → service names parsing (mirrors SQL backfill), report reasons,
  error-code → message mapping.
- SQL check script `supabase/tests/051_review_photos_reports_check.sql`
  (rolled back): multi-service submit, photo path rules, duplicate
  prevention, edit window + locked, report once / not own / flags,
  keep/hide/restore, public views exclude hidden/removed, storage
  policies (own folder only, no public read), review_request
  notification once.
- Manual (after 048, 049, 051): phone-width submit with photos for a
  two-service booking, edit, report from another client, Admin keep/hide,
  service page + team page update; booking form stores services.

## 7. Deploy order

048 → 049 → 051 in the SQL Editor, then push. Run
`scripts/messenger-setup.ts` to create the new template. Rebuild the
BookingModal change and 051 together (the booking form writes
`appointment_services`, which 051 creates).

## 8. Out of scope

- Review replies from staff/Admin.
- Videos.
- Service pages for branches other than One Cecilia Center.
- Helpful/like votes on reviews.
