# GlowPoints Redemption & Vouchers (Part B) — Design Spec

Date: 2026-09-30
Status: Sections 1–2 approved in chat (2026-09-30); section 3 (errors/testing/deploy) delegated ("do what you think is right"); awaiting written-spec review
Builds on: `2026-09-30-ai-review-rewards-design.md` (migration 052: `client_rewards`, `points_transactions`, `add_points`, `review_reward_settings`)
Part of: AI Review Innovation System — Part B of 3.

## Purpose

Clients spend GlowPoints on personal discount vouchers (default ₱50 OFF for
500 points, ₱100 OFF for 1,000). Front Desk applies a voucher when the client
pays for a booking; the discount is recorded against that booking and the
voucher can't be reused. Unused vouchers expire and return their points.
Redeeming lowers the balance, never the tier (tiers use lifetime earned).

## Decisions (from the chat)

| Topic | Decision |
|---|---|
| Where vouchers are used | Front Desk only (booking payment screen); not in online booking/GCash |
| Expiry | Default 90 days (per option); unused expired vouchers return their points automatically + bell |
| Build | All writes through SECURITY DEFINER DB functions; daily pg_cron expiry job |
| Old `promo_codes` table | Not used (shared codes ≠ personal points vouchers) |
| One per booking | Max one voucher per booking; discount = min(voucher, remaining balance, max per booking) |
| Leftover value | Lost when the voucher exceeds the balance (warning shown to the desk first) |
| Undo | Front Desk can undo an application the same Manila day; voucher returns to active |
| Refunds | Booking refund/cancel does not restore a used voucher; Admin can adjust points manually |
| Admin adjust | Admin can add/remove points for a client with a required reason |

## Current state

- Ledger (052): `client_rewards(current_points, lifetime_earned, lifetime_redeemed)`,
  `points_transactions(type in opening_balance|review_reward|admin_adjustment, points, balance_after, appointment_id, review_evaluation_id, note, created_by)`,
  internal `add_points(client, type, points, appointment, evaluation, note, actor)`
  (keeps `profiles.loyalty_points` = balance; negative points increase
  `lifetime_redeemed`), settings row `review_reward_settings` (id = 1).
- Front Desk booking payment: `src/components/frontdesk/appointments/AppointmentPaymentModal.tsx`
  computes `total = servicePrice + additional_charges - discount` (free,
  unsaved `discount` input), `remainingBalance = total - settled payments`,
  and records cash with `markPaid` (`src/lib/supabase/queries/appointments.ts`).
- Client: `MyRewardsCard` (My Glow) with a disabled "Redeem Rewards — Coming soon".
- Admin: `/admin/reviews/rewards` (`RewardsManager`: queue, settings, stats).
- Bell: `client_notifications.kind` check includes `review_reward`.

## 1. Data — migration `053_glowpoints_redemption.sql` (requires 052)

### `reward_options`
`id, name text (1–60), points_cost int > 0, discount_amount numeric(10,2) > 0,
valid_days int 1–365 default 90, active boolean default true, sort_order int,
created_at, updated_at`. Seed: "₱50 OFF" 500/50/90, "₱100 OFF" 1000/100/90
(only when the table is empty). Read: authenticated. Write: admin via RPCs.

### `reward_vouchers`
`id, client_id → profiles, option_id → reward_options (set null), name text,
points_used int, discount_amount numeric(10,2), code text unique
(format GLOW-XXXX-XXXX, alphabet without 0/O/1/I), status in
(active, used, expired, cancelled), expires_at timestamptz, created_at,
used_at, used_appointment_id → appointments (set null), discount_applied
numeric(10,2), applied_by → profiles, cancelled_reason text,
cancelled_by → profiles`.
Unique partial index: one `used` voucher per `used_appointment_id`.
RLS read: owner, admin, front_desk. No direct writes.

### Settings (added to `review_reward_settings`)
`max_voucher_discount numeric(10,2) default 100 (0–100000)`,
`redemption_enabled boolean default true`. `update_review_reward_settings`
keeps its signature; new function `update_redemption_settings(p_max, p_enabled)` (admin).

### Ledger
`points_transactions.type` check gains `redemption`, `voucher_refund`;
new nullable `voucher_id → reward_vouchers`. Refunds add points back and
reduce `lifetime_redeemed` (not increase `lifetime_earned`) — new internal
helper `refund_points(client, points, voucher, note)`; `add_points` unchanged.

### Functions (SECURITY DEFINER)
- `redeem_reward(p_option_id) returns jsonb {voucherId, code, expiresAt, balance}`
  — client only (role customer), option active, redemption enabled, balance
  ≥ cost (row-locked `client_rewards`), creates voucher (retry on code
  collision), `add_points(..., 'redemption', -cost, ...)` with note
  "Redeemed <name> (<code>)". Errors: `REDEEM_DISABLED`, `REDEEM_NOT_ENOUGH`,
  `REDEEM_INVALID`, `REDEEM_FORBIDDEN`.
- `apply_voucher(p_appointment_id, p_code, p_remaining numeric) returns jsonb {voucherId, code, discount}`
  — admin/front_desk; voucher active + not expired + `client_id =
  appointment.client_id`; appointment has no used voucher; `p_remaining > 0`;
  discount = least(discount_amount, p_remaining, max_voucher_discount);
  marks used. Errors: `VOUCHER_NOT_FOUND`, `VOUCHER_WRONG_CLIENT`,
  `VOUCHER_EXPIRED`, `VOUCHER_USED`, `VOUCHER_ALREADY_APPLIED`,
  `VOUCHER_FORBIDDEN`, `VOUCHER_INVALID`.
- `undo_voucher(p_voucher_id)` — admin/front_desk; only `used` and `used_at`
  on the same Asia/Manila day; back to `active`, clears use fields.
  Error `VOUCHER_UNDO_EXPIRED`.
- `cancel_voucher(p_voucher_id, p_reason)` — admin; only `active`; status
  `cancelled`, `refund_points` + bell ("Your ₱50 OFF voucher was cancelled —
  500 GlowPoints returned.").
- `expire_vouchers() returns int` — cron (daily 00:10 Asia/Manila =
  16:10 UTC): every active voucher past `expires_at` → `expired`,
  `refund_points` + bell ("Your ₱50 OFF voucher expired — 500 GlowPoints
  returned.").
- `adjust_client_points(p_client_id, p_points, p_reason)` — admin; non-zero,
  |points| ≤ 100000, reason 1–500; cannot make balance negative
  (`POINTS_NEGATIVE`); writes `admin_adjustment`.
- Admin option management: `save_reward_option(p_id uuid null, p_name,
  p_points, p_discount, p_valid_days, p_active, p_sort)`.
- Bell kinds: `client_notifications.kind` check adds `voucher_expired`,
  `voucher_cancelled`, `points_adjusted`.

## 2. Screens

### Client — My Glow → My Rewards
- **Redeem Rewards** opens **Available Rewards**: active options (name,
  "500 GlowPoints", valid days); Redeem disabled with "Earn N more points"
  when unaffordable, or "Redemption is paused" when disabled.
- Confirm: "Use 500 GlowPoints for ₱50 OFF? Valid until <date>." → success
  "🎉 Reward Unlocked! Your ₱50 GlowSync discount is now available." with
  the code large + **Copy** + "Show this code at the front desk when you pay."
- **My Vouchers**: active first (code, amount, "Expires in N days", amber
  when < 7 days), then used/expired/cancelled (greyed, with date).
- Points history labels: `redemption` "Redeemed ₱50 OFF", `voucher_refund`
  "Voucher returned — expired/cancelled", `admin_adjustment` from Admin
  adjust "Adjustment by GlowSync".

### Front Desk — Appointments → payment modal
- **GlowPoints voucher** section (only for bookings with a client): the
  client's active vouchers with **Apply**, plus a code input + Apply.
- Warning before applying when voucher > remaining balance: "This voucher is
  worth ₱100 but only ₱60 is left — the extra ₱40 will be lost."
- Applied: "Voucher GLOW-… −₱50" line in the totals + **Undo** (same day);
  `total` includes the voucher discount; the existing free Discount input
  stays separate. Already-applied vouchers show on reopening the modal.

### Admin — /admin/reviews/rewards
- **Reward Options**: list + add/edit (name, points, discount, days valid,
  active, order).
- **Vouchers**: search by code or client name, status filter, Cancel
  (reason required) for active ones.
- **Settings**: max discount per booking, redemption on/off.
- **Stats**: points redeemed this month, active vouchers, ₱ discounts
  applied this month.
- **Adjust points** (client search → +/− points, reason) → `admin_adjustment`.

## 3. Errors, testing, deploy

| Situation | Behaviour |
|---|---|
| Not enough points / option inactive / redemption off | Redeem rejected with a clear message; no points taken |
| Double-tap Redeem | Row lock on `client_rewards`; second call sees the lower balance |
| Wrong client's voucher, expired, used, second voucher on a booking | Apply rejected with the specific message |
| Voucher > balance | Warning; discount capped; leftover lost |
| Applied by mistake | Undo same day |
| Expiry job misses a day | Next run catches every overdue voucher (idempotent) |
| Pre-053 | Redeem button stays "Coming soon"; payment modal hides the voucher section; admin sections show "Not set up yet" |

Testing:
- Vitest: voucher code format/alphabet, discount math (min of three),
  expiry countdown text, error-code → message maps, history labels.
- SQL check `supabase/tests/053_glowpoints_redemption_check.sql`: redeem
  deducts once and creates one voucher; not enough points rejected; apply
  rules (wrong client, expired, used, one per booking, caps); undo same day
  only; cancel/expire refund once and restore balance without touching
  `lifetime_earned`; adjust cannot go negative; clients cannot write
  vouchers/options or call staff functions; ledger sum = balance.
- Manual: redeem on phone, apply at Front Desk on a booking, undo, pay;
  cancel from Admin; force-expire (SQL) and see points + bell.

Deploy: apply 053 after 052. No new env vars or secrets.

## 4. Out of scope

Vouchers in online booking/GCash; percentage discounts; vouchers for walk-ins
without accounts; transferring vouchers; restoring vouchers on refunds.
