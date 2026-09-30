# AI Review Evaluation & GlowPoints Rewards (Part A) — Design Spec

Date: 2026-09-30
Status: Approved in chat section by section (2026-09-30); awaiting written-spec review
Builds on: `2026-09-30-review-photos-reports-design.md` (migration 051)
Part of: the user's "AI Review Innovation System" — Part A of 3
(A: evaluation + rewards, B: redemption/vouchers, C: Admin AI assistant & insights).

## Purpose

After a client reviews a completed booking, an AI grades the review's
**quality** against a configurable rubric, and a deterministic reward
engine turns those grades into **GlowPoints**. Rewards never depend on
star level or positivity, so honest negative feedback earns the same as
praise. Admin configures the rubric and decides anything the AI is unsure
about. Clients see a reward breakdown and a points history.

## Decisions (from the chat)

| Topic | Decision |
|---|---|
| Split | A (this spec) → B redemption/vouchers → C Admin AI assistant/insights |
| Timing | Evaluate right after submit (≤ ~15 s wait); otherwise pending + automatic retries + bell |
| Scope of grading | The whole visit review together (all service parts, therapist, branch, photos); one reward per booking, max 50 |
| Tiers | Tiers use **lifetime points earned**; redeeming (Part B) lowers the balance, never the tier |
| Architecture | Next.js server route calls Gemini; a SECURITY DEFINER DB function (reward engine) awards points |
| AI provider | Existing Google Gemini (`gemini-2.5-flash-lite`, `GEMINI_API_KEY`), multimodal for photos |
| Existing points | Current `loyalty_points` become an "opening balance" transaction |
| Old reviews | Reviews submitted before this feature earn no points |

## Current state

- Reviews: migration 048 + 051 (`reviews` per visit part, `review_photos` in
  private bucket `review-photos`, `submit_visit_review` / `edit_visit_review`,
  statuses visible/flagged/hidden/removed). Client form:
  `src/components/reviews/VisitReviewModal.tsx`, data layer
  `src/lib/supabase/queries/visitReviews.ts`.
- Points: `profiles.loyalty_points integer` (schema.sql); nothing in code
  awards points. Tiers in `src/lib/myGlowTiers.ts` (Bronze 0, Silver 1000,
  Gold 2000, Platinum 5000) shown by `GlowRewardsCard` on My Glow and used by
  the assistant. 050's guard makes `loyalty_points` read-only for clients.
- AI: `src/app/api/assistant/route.ts` calls Gemini REST
  (`generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`).
- Background pattern: 047 Messenger — pg_cron + pg_net ping a Next.js route
  with URL/secret from Supabase Vault.
- Bell: `client_notifications` (049, kinds confirmed/cancelled/review_request).

## 1. Data — migration `052_review_rewards.sql` (requires 048, 049, 051)

### `review_reward_settings` (single row, id = 1)
`rating_points 10, meaningful_points 10, specific_points 10,
relevant_points 10, photo_points 10, partial_ratio numeric 0.5 (0–1),
max_points 50, enabled boolean true, updated_at, updated_by`.
Read: authenticated. Write: admin only via `update_review_reward_settings(...)`.

### `review_evaluations` (one per appointment)
`id, appointment_id unique, client_id, status` in
(`pending`, `evaluated`, `needs_review`, `failed`, `skipped`),
per criterion (`rating`, `meaningful`, `specific`, `relevant`, `photo`):
`<c>_result` in (`pass`, `partial`, `fail`, `needs_review`, `not_provided`),
`<c>_confidence` in (`high`, `medium`, `low`), `<c>_reason text`;
`ai_summary text, model text, attempts int, last_error text,
settings_snapshot jsonb` (the point values used), `points_awarded int`,
`created_at, evaluated_at`.
RLS: client reads own; admin reads all; no direct writes.

### `points_transactions`
`id, client_id, type` in (`opening_balance`, `review_reward`,
`admin_adjustment`) — Part B adds `redemption` —
`points int` (+/−), `balance_after int`, `appointment_id, review_evaluation_id`
(nullable), `note text, created_by uuid, created_at`.
Unique `(review_evaluation_id, type)` where type = 'review_reward' — at most one
reward row per evaluation; override top-ups use type `admin_adjustment`
referencing the evaluation.
RLS: client reads own; admin/front_desk read all; no direct writes.

### `client_rewards`
`client_id pk, current_points, lifetime_earned, lifetime_redeemed, updated_at`.
Maintained only by the reward functions; `profiles.loyalty_points` is kept
equal to `current_points` (written by the same functions, which set the 050
RPC flag so the profile guard allows it).
Backfill: one `opening_balance` transaction + `client_rewards` row for each
profile with `loyalty_points > 0` (lifetime_earned = that value).

### `review_evaluation_overrides`
`id, evaluation_id, criterion, original_result, decision` in
(`pass`, `partial`, `fail`), `reason text not null, admin_id, points_delta, created_at`.

### Review tags
`reviews.tags text[]` (service parts only), each value in the fixed set:
`Professional, Relaxing, Clean, Friendly, Good Value, Great Service,
Skilled Therapist, Comfortable, Effective` (max 6). The client shows the last
three only for massage services (service/category name contains
"massage", case-insensitive). Saved right after submit/edit by the owner-only
RPC `set_visit_review_tags(p_appointment_id, [{position, tags}])` (051's
submit/edit functions stay unchanged).

### Functions (SECURITY DEFINER)
- `start_review_evaluation()` — AFTER INSERT trigger on `reviews`: for a
  service part inserted with `first_submitted_at = now()` (a first
  submission, never an edit) it inserts the `pending` evaluation (or
  `skipped` when rewards are disabled), once per appointment.
- `claim_review_evaluation(p_appointment_id) returns jsonb` — service role
  only: returns the evaluation id + everything the AI needs (services,
  ratings, texts, tags, photo paths) if status is `pending` or `failed` with
  attempts < 5, and increments `attempts`.
- `apply_review_evaluation(p_evaluation_id, p_result jsonb, p_model text)` —
  service role only. Validates the JSON shape; forces `needs_review` for any
  criterion with confidence `low`; computes points from the settings row:
  pass = full, partial = round(full × partial_ratio), others 0; caps at
  `max_points`; stars never used. Writes the evaluation, one
  `review_reward` transaction (if points > 0), updates `client_rewards` +
  `profiles.loyalty_points`; status `needs_review` if any criterion needs
  review, else `evaluated`. Inserts a bell notification (new
  `client_notifications.kind` value `review_reward`, link `/my-glow#rewards`,
  "You earned +N GlowPoints for your review").
  Idempotent: a second call for an already-applied evaluation is a no-op.
- `fail_review_evaluation(p_evaluation_id, p_error text)` — service role:
  records the error; status `failed` after 5 attempts, else stays `pending`.
- `override_review_criterion(p_evaluation_id, p_criterion, p_decision, p_reason)`
  — admin only; only for criteria currently `needs_review`; records the
  override, adds the delta as an `admin_adjustment` transaction (respecting
  `max_points` for the evaluation), and marks the evaluation `evaluated` when
  none remain.
- Tier source: `client_rewards.lifetime_earned` (fallback `loyalty_points`).

### Retry job
pg_cron every 5 minutes: if any evaluation is `pending` and older than
1 minute, pg_net POSTs to the URL in Vault secret `review_eval_url` with
header secret `review_eval_secret` (same pattern as 047). The route then
processes up to 10 due evaluations.

## 2. AI evaluation (server)

- `POST /api/reviews/evaluate` body `{ appointmentId }`:
  - client call: signed-in user must own the appointment; evaluates that one.
  - cron call: header secret matches `REVIEW_EVAL_SECRET`; processes up to 10
    pending/failed-retryable evaluations.
- Loads data via `claim_review_evaluation` (service role), downloads photos
  from `review-photos` (service role), sends Gemini one request with:
  system instructions (rubric definitions, rating neutrality, useful
  complaints count, off-topic length does not count, never assess people's
  identity/appearance/sensitive traits in photos, answer "needs_review" when
  unsure), the review content (service names, per-part stars, texts, tags;
  no names/contacts), inline photos, and a JSON response schema.
- Response parsed + validated (`src/lib/reviewRewards.ts`); invalid →
  `fail_review_evaluation`. Timeout 15 s for client calls.
- The route returns the applied evaluation (grades, reasons, points,
  balance) or `{ status: "pending" }`.

## 3. Screens

### Client
- Review form: tag chips under each service comment.
- After submit: "Evaluating your review…" then the **Review Evaluated!**
  panel: per criterion ✓ Pass / ½ Partial / ✗ Fail / ⏳ Needs review /
  — Not provided, points, AI reason; total; new balance; **View My Rewards**
  / **Done**. Pending: "Thanks! Your reward is being calculated — we'll
  notify you." Needs review part: "+30 now, up to +10 more after our team
  checks."
- **My Rewards** card (replaces `GlowRewardsCard`): ✨ GlowPoints balance;
  tier + progress to next tier from lifetime points; **Points History**
  (activity, date, ±points; 10 at a time with Show more); **Redeem Rewards**
  button disabled with "Coming soon".
- My Services: reviewed visits show "+N GlowPoints" or "Reward pending".

### Admin → Reviews → **Rewards** tab
- Needs Review queue: review content + photos + AI grades/reasons; per
  needs-review criterion Approve / Partial / Reject + required reason;
  failed evaluations with **Retry**.
- Reward Settings form (confirm on save; applies to future evaluations only).
- Stats: points issued this month, reviews rewarded, average points.
- Review detail panel: the visit's AI evaluation (grades, confidence,
  summary, points, overrides).

## 4. Error handling

| Situation | Behaviour |
|---|---|
| Gemini slow/down/quota | Review saved; reward pending; cron retries ×5; then `failed` → Admin Retry |
| Invalid AI output | Counted as a failed attempt; never awarded |
| Low confidence / unclear photo | `needs_review`, 0 points until Admin decides |
| Duplicate / foreign call | Rejected; one evaluation + one reward per appointment |
| Rewards disabled | Evaluation `skipped`; no AI call; no points |
| Missing `GEMINI_API_KEY` | Stays pending; warning logged |
| Review later removed by Admin | Awarded points stay (reversal out of scope) |

## 5. Testing

- Vitest: reward math (settings × grades; stars ignored; partial rounding;
  cap), AI response validation, prompt builder excludes personal data,
  breakdown formatting, tier progress from lifetime points.
- SQL check `supabase/tests/052_review_rewards_check.sql`: evaluation created
  on submit only; no client writes to rewards tables; apply is idempotent;
  low confidence → needs_review; override adds points once and respects cap;
  balance/lifetime/loyalty_points stay consistent; edits don't re-evaluate.
- Manual: detailed 2★ review with photo (up to 50), "Good." (low), long
  off-topic text (relevance fail), Admin override, Gemini key removed
  (pending → retry).

## 6. Deploy

Apply 048 → 049 → 051 → 052. Add Vault secrets `review_eval_url`
(`https://<site>/api/reviews/evaluate`) and `review_eval_secret`, and env
`REVIEW_EVAL_SECRET` (same value) in `.env.local` and Vercel.
`GEMINI_API_KEY` already exists.

## 7. Out of scope (Parts B/C or later)

Redemption, vouchers and discounts (B); Admin AI chat, insights, trends,
analytics, moderation flags, suggested replies (C); reversing points for
removed reviews; retroactive rewards.
