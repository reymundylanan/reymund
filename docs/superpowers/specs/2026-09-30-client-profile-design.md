# Client Profile (My Profile) — Design Spec

Date: 2026-09-30
Status: Approved in chat (2026-09-30); awaiting written-spec review

## Purpose

Signed-in clients can view and edit their own profile — photo, full name,
phone, gender, address — from a "My Profile" page reached by clicking their
photo/name in the header. Changes are validated on the client and the
server, and appear live on the Admin and Front Desk client screens. Clients
can never change anything else (role, points, appointments, payments,
reviews, other people's data).

This work also closes an existing security hole (below).

## Decisions (from the chat)

| Topic | Decision |
|---|---|
| Entry point | Click the photo circle or name in the header → `/my-glow/profile` |
| Page | Dedicated page; "Edit Profile" switches to a form with "Save Changes" |
| Gender | Female / Male / Prefer not to say (optional) |
| Address | One text field, required, 5–200 characters |
| Phone | PH mobile, stored `+63 9XX XXX XXXX` (same as the booking form) |
| Photo | Circle crop (reuse `AvatarCropModal`), JPG/PNG/WebP ≤ 5 MB, bucket `avatars`, folder `clients/<uid>/` |
| Write path | DB function `update_my_profile` + a guard trigger (not column grants) |

## Current state

- `profiles`: `id, full_name, email, phone, role, branch_id, avatar_url,
  vip, loyalty_points, total_spend, allergy, preferences, gdpr_consented,
  created_at` (+ `username`, `restricted` from later migrations). No
  `gender`, no `address`.
- RLS `users update own profile` (schema.sql:198) is `using (auth.uid() = id)`
  with **no column restriction** → **security hole:** a client can change
  their own `role` (e.g. to `admin`), `loyalty_points`, `vip`,
  `total_spend`, `restricted`, `branch_id`, `username`, `email` by calling
  the REST API directly.
- Existing legitimate writes to `profiles` that must keep working:
  booking form updates the client's own `phone`
  (`BookingModal.tsx`); admin API routes (`update-user`, `restrict-user`)
  use the service role; `auth/callback` inserts new customer profiles.
- Storage bucket `avatars` exists (staff photos). Header shows an initial
  only. `useCurrentUser` returns `id, fullName, role` (no avatar).

## 1. Data & security — migration `050_client_profile.sql`

### Columns
- `profiles.gender text` check in (`female`, `male`, `prefer_not_to_say`) or null.
- `profiles.address text` (length checked by the function, not a table
  constraint, so existing rows stay valid).

### Guard trigger (closes the hole)
`protect_profile_fields()` — BEFORE UPDATE on `profiles`, SECURITY DEFINER.
When `auth.uid() = old.id` **and** the caller's role is `customer`
(i.e. a client editing their own row through the API), raise
`PROFILE_FIELD_LOCKED` if any of these change: `role, email, username,
branch_id, vip, loyalty_points, total_spend, restricted, gdpr_consented,
allergy, preferences, created_at, id`. Allowed for clients: `full_name,
phone, gender, address, avatar_url`. Staff/admin sessions and the service
role (`auth.uid()` null) are unaffected. Rows other than their own are
already blocked by RLS.

### `update_my_profile(p_full_name, p_phone, p_gender, p_address)`
SECURITY DEFINER, granted to `authenticated`. Only updates `auth.uid()`'s
row, only for role `customer`. Validates and normalizes, raising
`PROFILE_INVALID:<field>` with the field name:
- full_name: trimmed, single spaces, 2–80 chars, letters (incl. accented),
  spaces, `.`, `'`, `-`.
- phone: digits extracted; accept `09XXXXXXXXX`, `9XXXXXXXXX`,
  `639XXXXXXXXX`; stored as `+63 9XX XXX XXXX`.
- gender: one of the three values or null/empty → null.
- address: HTML tags and control chars stripped, spaces collapsed, 5–200.

### Photo
- Storage policies on `storage.objects` for bucket `avatars`: authenticated
  users may insert/update/delete only objects whose path starts with
  `clients/<auth.uid()>/`; public read stays as it is.
- `set_my_avatar(p_url text)`: accepts only a public URL of an object in
  `avatars/clients/<auth.uid()>/`; sets `avatar_url`.
- `remove_my_avatar()`: sets `avatar_url = null` (the client UI also
  deletes the file).

### Realtime
Add `profiles` to `supabase_realtime` (guarded). Existing RLS limits what
each subscriber receives (own row; staff/admin all).

## 2. Screens

### Header
Client's circle shows `avatar_url` (or initial). The photo + name are a
link to `/my-glow/profile` (clients only). `useCurrentUser` gains
`avatarUrl` and refreshes on the client's own profile changes.

### `/my-glow/profile` (server page + client component)
- Signed out → `loginRedirectPath("/my-glow/profile")`; non-customer → `/`.
- **View mode:** card with photo, name; rows Phone, Gender, Address, Email
  (read-only, from login). "Edit Profile" button. Back link to My Glow.
- **Edit mode:** photo actions (Change photo → file pick → type/size check
  → `AvatarCropModal` → upload to `avatars/clients/<uid>/<timestamp>.jpg`
  → `set_my_avatar`, old file deleted; Remove photo → confirm →
  `remove_my_avatar` + delete file). Inputs for Full Name, Phone (formatted
  as typed), Gender (select), Address (textarea). Inline validation messages
  under each field using the shared validator; "Save Changes" disabled until
  something changed and all fields valid; "Cancel" discards.
- On success: "Profile updated ✓" banner, back to view mode, header updates.
- Server errors map `PROFILE_INVALID:<field>` to that field's message;
  anything else → "Couldn't save your profile. Please try again."
- Mobile: single column; Save/Cancel pinned at the bottom while editing.

### Admin & Front Desk
- Admin Users (client view) and Front Desk Clients show photo, gender,
  address, and refresh live (Realtime on `profiles`).

## 3. Shared validation — `src/lib/profileValidation.ts`

Pure functions mirroring the SQL rules: `validateFullName`,
`normalizePhone` / `validatePhone`, `validateGender`, `validateAddress`,
`validateProfile(form) → Record<field, message | null>`. Messages:
- Name: "Enter your full name (2–80 letters)."
- Phone: "Enter a valid PH mobile number, e.g. 0917 123 4567."
- Address: "Enter your address (5–200 characters)."
- Photo: "Use a JPG, PNG or WebP image up to 5 MB."

## 4. Error handling

| Situation | Behaviour |
|---|---|
| Invalid field | Inline message; server rejection shows on the same field |
| Client edits a locked field via API | `PROFILE_FIELD_LOCKED`, nothing saved |
| Client calls function while not a customer / signed out | Rejected |
| Photo wrong type/too big | Message, no upload |
| Upload fails | "Couldn't upload your photo. Please try again." — profile unchanged |
| Photo URL outside own folder | `set_my_avatar` rejects |
| Save fails (network) | Generic message, form keeps values |

## 5. Testing

- Vitest: `profileValidation.ts` (names incl. accents/hyphens, phone
  formats, gender, address stripping/length).
- SQL check script `supabase/tests/050_client_profile_check.sql`
  (rolled back): client can update allowed fields via function; client
  cannot change own role/points via direct update (`PROFILE_FIELD_LOCKED`);
  client cannot update another profile; invalid values rejected per field;
  `set_my_avatar` rejects another user's folder; staff/service-role updates
  unaffected.
- Manual: edit on a phone-width screen with an Admin tab open; photo
  upload/change/remove; booking form still saves phone.

## 6. Out of scope

- Changing email/password (login-managed).
- Allergy/preferences editing by clients (staff-managed fields).
- Deleting the account.
