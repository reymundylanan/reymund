# Client Profile (My Profile) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients view/edit their own photo, name, phone, gender and address at `/my-glow/profile` (opened from the header photo/name), validated client- and server-side, synced live to Admin/Front Desk — and clients can no longer change any other profile field (closes the role-escalation hole).

**Architecture:** Migration 050 adds `gender`/`address`, a BEFORE UPDATE guard trigger that rejects customer self-edits of protected columns, SECURITY DEFINER functions `update_my_profile`, `set_my_avatar`, `remove_my_avatar`, storage policies for `avatars/clients/<uid>/`, and Realtime on `profiles`. A pure validator (`profileValidation.ts`) mirrors the SQL rules for inline form errors. A client component edits the profile; the header and Admin/Front Desk lists refresh live.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, Supabase (Postgres, RLS, Storage, Realtime), Tailwind, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-client-profile-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` for any Next API you're unsure of (AGENTS.md). Page `params`/`searchParams` are Promises.
- Migration file `supabase/migrations/050_client_profile.sql`; the user applies it in the Supabase SQL Editor. Never run SQL against the live DB.
- Clients may change only: `full_name, phone, gender, address, avatar_url`. Protected: `role, email, username, branch_id, vip, loyalty_points, total_spend, restricted, gdpr_consented, allergy, preferences, created_at, id`.
- Gender values exactly: `female`, `male`, `prefer_not_to_say` (or null). Labels: Female, Male, Prefer not to say.
- Phone stored exactly as `+63 9XX XXX XXXX`. Accepted input digits: `09XXXXXXXXX`, `9XXXXXXXXX`, `639XXXXXXXXX` (any spaces/dashes/+).
- Name: 2–80 chars after trim/collapse, letters (incl. accented), spaces, `.`, `'`, `-`.
- Address: tags + control chars stripped, whitespace collapsed to single spaces, 5–200 chars. Required.
- Phone and full name required; gender optional.
- Photo: JPG/PNG/WebP, ≤ 5 MB, cropped to a circle via `src/components/admin/users/AvatarCropModal.tsx` (`{ src, onDone(blob), onCancel }`), stored in bucket `avatars` at `clients/<uid>/<timestamp>.jpg`.
- Server errors: `PROFILE_INVALID:<full_name|phone|gender|address>`, `PROFILE_FIELD_LOCKED`, `PROFILE_FORBIDDEN`, `PROFILE_BAD_AVATAR`.
- Messages (exact): name "Enter your full name (2–80 letters).", phone "Enter a valid PH mobile number, e.g. 0917 123 4567.", address "Enter your address (5–200 characters).", gender "Choose a gender option.", photo "Use a JPG, PNG or WebP image up to 5 MB.", success "Profile updated ✓", generic "Couldn't save your profile. Please try again.", upload "Couldn't upload your photo. Please try again."
- Use `logQueryError` (`src/lib/supabase/logQueryError.ts`) for query errors in new code.
- Style: Tailwind tokens `ink`, `coral`, `coral-dark`, `blush`, `rose`, `gold`; lucide-react icons; mobile-first.
- Commits end with a blank line then exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Existing flows that write `profiles` must keep working after 050:** the booking form's own-phone update (client session), admin API routes (service role), `set_client_vip` (staff session), `auth/callback` insert. The guard must only fire for a customer editing their own row's protected columns (SQL check script, Task 1).
2. **A client with an old/odd phone format** (e.g. `+639171234567`, `0917-123-4567`) must be accepted and normalized, not rejected (Task 2 tests + SQL check).
3. **Names with accents/hyphens/apostrophes** ("José Mari Dela Cruz-Santos", "O'Neil") must pass; names with digits/emoji must fail (Task 2 tests).
4. **Photo replaced/removed** must not leave the old file referenced, and a URL outside the client's own folder must be rejected (Task 1 SQL + Task 3).
5. **Admin/Front Desk open while a client saves** — their list/panel must refresh without reload (Task 5 Realtime).

---

### Task 1: Migration 050 + SQL check script

**Files:** Create `supabase/migrations/050_client_profile.sql`, `supabase/tests/050_client_profile_check.sql`

- [ ] **Step 1: Migration**

```sql
-- 050_client_profile.sql
-- Client "My Profile": adds gender/address, lets clients update ONLY their
-- own name/phone/gender/address/photo through checked functions, and
-- closes the hole where the "users update own profile" policy let a client
-- change their own role, points, VIP, etc. by calling the API directly.

alter table profiles add column if not exists gender text;
alter table profiles add column if not exists address text;

alter table profiles drop constraint if exists profiles_gender_check;
alter table profiles add constraint profiles_gender_check
  check (gender is null or gender in ('female', 'male', 'prefer_not_to_say'));

-- ── Guard: customers cannot change protected fields on their own row ──

create or replace function protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and old.role::text = 'customer' then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.email is distinct from old.email
       or new.username is distinct from old.username
       or new.branch_id is distinct from old.branch_id
       or new.vip is distinct from old.vip
       or new.loyalty_points is distinct from old.loyalty_points
       or new.total_spend is distinct from old.total_spend
       or new.restricted is distinct from old.restricted
       or new.gdpr_consented is distinct from old.gdpr_consented
       or new.allergy is distinct from old.allergy
       or new.preferences is distinct from old.preferences
       or new.created_at is distinct from old.created_at then
      raise exception 'PROFILE_FIELD_LOCKED';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function protect_profile_fields() from public, anon, authenticated;

drop trigger if exists profiles_protect_fields on profiles;
create trigger profiles_protect_fields
  before update on profiles
  for each row execute function protect_profile_fields();

-- ── Update own profile ────────────────────────────────────────────────

create or replace function update_my_profile(
  p_full_name text, p_phone text, p_gender text, p_address text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_phone text;
  v_gender text := nullif(btrim(coalesce(p_gender, '')), '');
  v_address text;
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role::text = 'customer') then
    raise exception 'PROFILE_FORBIDDEN';
  end if;

  if length(v_name) < 2 or length(v_name) > 80 or v_name !~ '^[[:alpha:] .''-]+$' then
    raise exception 'PROFILE_INVALID:full_name';
  end if;

  if v_digits ~ '^639[0-9]{9}$' then
    v_digits := substr(v_digits, 3);
  elsif v_digits ~ '^09[0-9]{9}$' then
    v_digits := substr(v_digits, 2);
  end if;
  if v_digits !~ '^9[0-9]{9}$' then
    raise exception 'PROFILE_INVALID:phone';
  end if;
  v_phone := '+63 ' || substr(v_digits, 1, 3) || ' ' || substr(v_digits, 4, 3) || ' ' || substr(v_digits, 7, 4);

  if v_gender is not null and v_gender not in ('female', 'male', 'prefer_not_to_say') then
    raise exception 'PROFILE_INVALID:gender';
  end if;

  v_address := btrim(regexp_replace(
    regexp_replace(
      regexp_replace(coalesce(p_address, ''), '</?[a-zA-Z][^>]*>', '', 'g'),
      '[\x00-\x1F\x7F]', ' ', 'g'),
    '\s+', ' ', 'g'));
  if length(v_address) < 5 or length(v_address) > 200 then
    raise exception 'PROFILE_INVALID:address';
  end if;

  update profiles
     set full_name = v_name, phone = v_phone, gender = v_gender, address = v_address
   where id = v_uid;
end;
$$;

revoke execute on function update_my_profile(text, text, text, text) from public, anon;
grant execute on function update_my_profile(text, text, text, text) to authenticated;

-- ── Photo ─────────────────────────────────────────────────────────────

create or replace function set_my_avatar(p_url text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role::text = 'customer') then
    raise exception 'PROFILE_FORBIDDEN';
  end if;
  if p_url is null
     or p_url !~ ('^https://[^/]+/storage/v1/object/public/avatars/clients/' || v_uid::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'PROFILE_BAD_AVATAR';
  end if;
  update profiles set avatar_url = p_url where id = v_uid;
end;
$$;

create or replace function remove_my_avatar() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from profiles where id = v_uid and role::text = 'customer') then
    raise exception 'PROFILE_FORBIDDEN';
  end if;
  update profiles set avatar_url = null where id = v_uid;
end;
$$;

revoke execute on function set_my_avatar(text) from public, anon;
grant execute on function set_my_avatar(text) to authenticated;
revoke execute on function remove_my_avatar() from public, anon;
grant execute on function remove_my_avatar() to authenticated;

-- ── Storage: clients manage only avatars/clients/<their id>/… ─────────

drop policy if exists "clients insert own avatar" on storage.objects;
create policy "clients insert own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'clients'
              and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "clients update own avatar" on storage.objects;
create policy "clients update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'clients'
         and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'clients'
              and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "clients delete own avatar" on storage.objects;
create policy "clients delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'clients'
         and (storage.foldername(name))[2] = auth.uid()::text);

-- ── Realtime ──────────────────────────────────────────────────────────

do $$ begin
  alter publication supabase_realtime add table profiles;
exception when duplicate_object then null; end $$;
```

- [ ] **Step 2: Check script**

```sql
-- Run AFTER applying 050. Rolled back. Placeholders:
--   :CLIENT_ID   a customer profile id
--   :OTHER_ID    a different customer profile id
--   :STAFF_ID    a front_desk or admin profile id
begin;

select set_config('request.jwt.claims', json_build_object('sub', ':CLIENT_ID', 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. Valid update through the function, odd phone format normalized
select update_my_profile('José Mari Dela Cruz-Santos', '+63 917-123-4567', 'male', '  Purok 3,   Brgy. San Francisco <b>Pagadian</b> ');
select full_name, phone, gender, address from profiles where id = ':CLIENT_ID';
-- expect: José Mari Dela Cruz-Santos | +63 917 123 4567 | male | Purok 3, Brgy. San Francisco Pagadian

-- 2. Invalid values rejected per field
do $$ declare f text; begin
  foreach f in array array['name','phone','gender','address'] loop
    begin
      perform update_my_profile(
        case when f = 'name' then 'J0hn 😀' else 'Ana Cruz' end,
        case when f = 'phone' then '12345' else '09171234567' end,
        case when f = 'gender' then 'other' else null end,
        case when f = 'address' then 'abc' else 'Purok 1, Pagadian' end);
      raise warning 'FAIL % accepted', f;
    exception when others then raise notice 'PASS % rejected: %', f, sqlerrm; end;
  end loop;
end $$;

-- 3. Direct update of a protected field is blocked
do $$ begin
  update profiles set role = 'admin' where id = ':CLIENT_ID';
  raise warning 'FAIL role change accepted';
exception when others then
  if sqlerrm = 'PROFILE_FIELD_LOCKED' then raise notice 'PASS role locked'; else raise warning 'FAIL got %', sqlerrm; end if;
end $$;
do $$ begin
  update profiles set loyalty_points = 99999 where id = ':CLIENT_ID';
  raise warning 'FAIL points change accepted';
exception when others then raise notice 'PASS points locked: %', sqlerrm; end $$;

-- 4. Direct update of an allowed field (booking form's phone update) still works
update profiles set phone = '+63 918 000 0000' where id = ':CLIENT_ID';
select 'phone still editable:' as check, phone from profiles where id = ':CLIENT_ID';

-- 5. Another client's row is untouched (RLS)
update profiles set full_name = 'Hacked' where id = ':OTHER_ID';
select 'other row unchanged (must not be Hacked):' as check, full_name from profiles where id = ':OTHER_ID';

-- 6. Avatar URL must be in own folder
do $$ begin
  perform set_my_avatar('https://x.supabase.co/storage/v1/object/public/avatars/clients/:OTHER_ID/a.jpg');
  raise warning 'FAIL foreign avatar accepted';
exception when others then raise notice 'PASS foreign avatar rejected: %', sqlerrm; end $$;
select set_my_avatar('https://x.supabase.co/storage/v1/object/public/avatars/clients/:CLIENT_ID/1700000000.jpg');
select remove_my_avatar();
reset role;

-- 7. Staff session is not affected by the guard
select set_config('request.jwt.claims', json_build_object('sub', ':STAFF_ID', 'role', 'authenticated')::text, true);
update profiles set vip = not vip where id = ':CLIENT_ID';
select 'staff/postgres can still change vip:' as check, vip from profiles where id = ':CLIENT_ID';

-- 8. Storage policies on avatars (review manually for anything overly permissive)
select policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%avatars%' or with_check ilike '%avatars%');

rollback;
```

- [ ] **Step 3: Self-review** the SQL against spec §1 and existing `profiles` columns (`username` from migration 002, `restricted` from its migration). Confirm `role` is enum `user_role` (compare via `::text`).

- [ ] **Step 4: Deferred (user):** apply 050, run the check script with placeholders; expect every PASS and the values in comments.

- [ ] **Step 5: Commit** — `git commit -m "feat: client profile fields, self-edit functions and profile field guard (050)"`

---

### Task 2: Shared profile validation

**Files:** Create `src/lib/profileValidation.ts`, `src/lib/profileValidation.test.ts`

**Produces:**
- `type ProfileField = "fullName" | "phone" | "gender" | "address"`; `type ProfileForm = Record<ProfileField, string>`
- `GENDER_OPTIONS: { value: string; label: string }[]`
- `normalizeName(s)`, `validateFullName(s)`, `normalizePhone(s): string | null`, `validatePhone(s)`, `validateGender(s)`, `cleanAddress(s)`, `validateAddress(s)`, `validateProfile(f): Record<ProfileField, string | null>`, `formatPhoneForInput(stored: string | null): string`, `validatePhotoFile(f: { type: string; size: number }): string | null`, `profileErrorField(message: string): ProfileField | null`, `PROFILE_MESSAGES`

- [ ] **Step 1: Tests**

```ts
import { describe, expect, it } from "vitest";
import {
  cleanAddress,
  formatPhoneForInput,
  normalizePhone,
  profileErrorField,
  validateAddress,
  validateFullName,
  validateGender,
  validatePhotoFile,
  validateProfile,
} from "./profileValidation";

describe("validateFullName", () => {
  it.each(["Ana Cruz", "José Mari Dela Cruz-Santos", "O'Neil", "Ma. Theresa", "Li"])("accepts %s", (n) => {
    expect(validateFullName(n)).toBeNull();
  });
  it.each(["A", "J0hn", "Ana 😀", "x".repeat(81), "   "])("rejects %s", (n) => {
    expect(validateFullName(n)).toBe("Enter your full name (2–80 letters).");
  });
});

describe("normalizePhone", () => {
  it.each([
    ["09171234567", "+63 917 123 4567"],
    ["0917 123 4567", "+63 917 123 4567"],
    ["0917-123-4567", "+63 917 123 4567"],
    ["+639171234567", "+63 917 123 4567"],
    ["+63 917 123 4567", "+63 917 123 4567"],
    ["9171234567", "+63 917 123 4567"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));
  it.each(["12345", "08171234567", "091712345678", ""])("rejects %s", (input) => expect(normalizePhone(input)).toBeNull());
});

describe("validateGender", () => {
  it("accepts the options and empty", () => {
    for (const g of ["female", "male", "prefer_not_to_say", ""]) expect(validateGender(g)).toBeNull();
  });
  it("rejects other values", () => expect(validateGender("other")).toBe("Choose a gender option."));
});

describe("address", () => {
  it("strips tags and collapses whitespace", () => {
    expect(cleanAddress("  Purok 3,\n  Brgy. <b>San Francisco</b>  ")).toBe("Purok 3, Brgy. San Francisco");
  });
  it("keeps comparisons that aren't tags", () => expect(cleanAddress("Lot 5 < Blk 2")).toBe("Lot 5 < Blk 2"));
  it("enforces 5–200 characters", () => {
    expect(validateAddress("abc")).toBe("Enter your address (5–200 characters).");
    expect(validateAddress("a".repeat(201))).toBe("Enter your address (5–200 characters).");
    expect(validateAddress("Purok 1, Pagadian")).toBeNull();
  });
});

describe("validateProfile", () => {
  it("returns a message per invalid field", () => {
    expect(validateProfile({ fullName: "A", phone: "123", gender: "x", address: "ab" })).toEqual({
      fullName: "Enter your full name (2–80 letters).",
      phone: "Enter a valid PH mobile number, e.g. 0917 123 4567.",
      gender: "Choose a gender option.",
      address: "Enter your address (5–200 characters).",
    });
  });
});

describe("helpers", () => {
  it("formats a stored phone for the input", () => {
    expect(formatPhoneForInput("+63 917 123 4567")).toBe("0917 123 4567");
    expect(formatPhoneForInput(null)).toBe("");
  });
  it("checks photo type and size", () => {
    expect(validatePhotoFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validatePhotoFile({ type: "image/gif", size: 1000 })).toBe("Use a JPG, PNG or WebP image up to 5 MB.");
    expect(validatePhotoFile({ type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("Use a JPG, PNG or WebP image up to 5 MB.");
  });
  it("maps server error codes to fields", () => {
    expect(profileErrorField("PROFILE_INVALID:full_name")).toBe("fullName");
    expect(profileErrorField("PROFILE_INVALID:phone")).toBe("phone");
    expect(profileErrorField("PROFILE_FORBIDDEN")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/profileValidation.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// Mirrors the checks in update_my_profile (migration 050) so the form can
// show inline errors before saving. The database remains the authority.

export type ProfileField = "fullName" | "phone" | "gender" | "address";
export type ProfileForm = Record<ProfileField, string>;

export const PROFILE_MESSAGES = {
  fullName: "Enter your full name (2–80 letters).",
  phone: "Enter a valid PH mobile number, e.g. 0917 123 4567.",
  gender: "Choose a gender option.",
  address: "Enter your address (5–200 characters).",
  photo: "Use a JPG, PNG or WebP image up to 5 MB.",
  success: "Profile updated ✓",
  generic: "Couldn't save your profile. Please try again.",
  upload: "Couldn't upload your photo. Please try again.",
} as const;

export const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function validateFullName(s: string): string | null {
  const n = normalizeName(s);
  return n.length >= 2 && n.length <= 80 && /^[\p{L} .'-]+$/u.test(n) ? null : PROFILE_MESSAGES.fullName;
}

/** "+63 9XX XXX XXXX", or null if not a PH mobile number. */
export function normalizePhone(s: string): string | null {
  let d = s.replace(/\D/g, "");
  if (/^639\d{9}$/.test(d)) d = d.slice(2);
  else if (/^09\d{9}$/.test(d)) d = d.slice(1);
  if (!/^9\d{9}$/.test(d)) return null;
  return `+63 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export function validatePhone(s: string): string | null {
  return normalizePhone(s) ? null : PROFILE_MESSAGES.phone;
}

export function validateGender(s: string): string | null {
  return s === "" || GENDER_OPTIONS.some((g) => g.value === s) ? null : PROFILE_MESSAGES.gender;
}

export function cleanAddress(s: string): string {
  return s
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateAddress(s: string): string | null {
  const a = cleanAddress(s);
  return a.length >= 5 && a.length <= 200 ? null : PROFILE_MESSAGES.address;
}

export function validateProfile(f: ProfileForm): Record<ProfileField, string | null> {
  return {
    fullName: validateFullName(f.fullName),
    phone: validatePhone(f.phone),
    gender: validateGender(f.gender),
    address: validateAddress(f.address),
  };
}

/** "+63 917 123 4567" → "0917 123 4567" for editing. */
export function formatPhoneForInput(stored: string | null): string {
  const n = stored ? normalizePhone(stored) : null;
  return n ? `0${n.slice(4)}` : "";
}

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export function validatePhotoFile(f: { type: string; size: number }): string | null {
  return PHOTO_TYPES.has(f.type) && f.size <= 5 * 1024 * 1024 ? null : PROFILE_MESSAGES.photo;
}

const FIELD_BY_SQL: Record<string, ProfileField> = {
  full_name: "fullName",
  phone: "phone",
  gender: "gender",
  address: "address",
};
export function profileErrorField(message: string): ProfileField | null {
  const m = /^PROFILE_INVALID:(\w+)$/.exec(message.trim());
  return m ? (FIELD_BY_SQL[m[1]] ?? null) : null;
}
```

(If eslint flags `no-control-regex`, add `// eslint-disable-next-line no-control-regex` on that line only.)

- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** — `feat: shared client profile validation`

---

### Task 3: Profile queries, header photo/link, current-user avatar

**Files:** Create `src/lib/supabase/queries/myProfile.ts`; Modify `src/lib/hooks/useCurrentUser.ts`, `src/components/Header.tsx`

**Produces:** `type MyProfile = { id; fullName; email: string | null; phone: string | null; gender: string | null; address: string | null; avatarUrl: string | null }`; `getMyProfile(supabase, userId)`; `updateMyProfile(supabase, form: ProfileForm): Promise<{ field: ProfileField | null; message: string } | null>`; `uploadMyAvatar(supabase, userId, blob, oldUrl): Promise<{ url?: string; error?: string }>`; `removeMyAvatar(supabase, userId, oldUrl): Promise<string | null>`; `PROFILE_UPDATED_EVENT = "glowsync:profile-updated"`.

- [ ] **Step 1: `myProfile.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { logQueryError } from "@/lib/supabase/logQueryError";
import { PROFILE_MESSAGES, profileErrorField, type ProfileField, type ProfileForm } from "@/lib/profileValidation";

export const PROFILE_UPDATED_EVENT = "glowsync:profile-updated";

export type MyProfile = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  address: string | null;
  avatarUrl: string | null;
};

export async function getMyProfile(supabase: SupabaseClient, userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, gender, address, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  logQueryError("getMyProfile", error);
  if (!data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    phone: data.phone,
    gender: data.gender ?? null,
    address: data.address ?? null,
    avatarUrl: data.avatar_url,
  };
}

/** null on success; otherwise the field (if the server named one) and a message. */
export async function updateMyProfile(
  supabase: SupabaseClient,
  form: ProfileForm
): Promise<{ field: ProfileField | null; message: string } | null> {
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: form.fullName,
    p_phone: form.phone,
    p_gender: form.gender,
    p_address: form.address,
  });
  if (!error) return null;
  const field = profileErrorField(error.message);
  if (!field) logQueryError("updateMyProfile", error);
  return { field, message: field ? PROFILE_MESSAGES[field] : PROFILE_MESSAGES.generic };
}

function ownObjectPath(url: string | null, userId: string): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/avatars/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length);
  return path.startsWith(`clients/${userId}/`) ? path : null;
}

export async function uploadMyAvatar(
  supabase: SupabaseClient,
  userId: string,
  blob: Blob,
  oldUrl: string | null
): Promise<{ url?: string; error?: string }> {
  const path = `clients/${userId}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
  if (upErr) {
    logQueryError("uploadMyAvatar", upErr as { message?: string });
    return { error: PROFILE_MESSAGES.upload };
  }
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.rpc("set_my_avatar", { p_url: url });
  if (error) {
    logQueryError("set_my_avatar", error);
    await supabase.storage.from("avatars").remove([path]);
    return { error: PROFILE_MESSAGES.upload };
  }
  const oldPath = ownObjectPath(oldUrl, userId);
  if (oldPath) await supabase.storage.from("avatars").remove([oldPath]);
  return { url };
}

export async function removeMyAvatar(supabase: SupabaseClient, userId: string, oldUrl: string | null): Promise<string | null> {
  const { error } = await supabase.rpc("remove_my_avatar");
  if (error) {
    logQueryError("remove_my_avatar", error);
    return PROFILE_MESSAGES.generic;
  }
  const oldPath = ownObjectPath(oldUrl, userId);
  if (oldPath) await supabase.storage.from("avatars").remove([oldPath]);
  return null;
}
```

- [ ] **Step 2: `useCurrentUser.ts`** — add `avatarUrl: string | null` to `CurrentUser`; select `full_name, role, avatar_url`; map `avatarUrl: data.avatar_url ?? null`. Inside the effect, also listen for the profile event so the header updates after a save:

```ts
    const onUpdated = () => {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) loadProfile(data.user.id);
      });
    };
    window.addEventListener("glowsync:profile-updated", onUpdated);
```

and in the cleanup: `window.removeEventListener("glowsync:profile-updated", onUpdated);` alongside the existing unsubscribe.

- [ ] **Step 3: `Header.tsx`** — for customers, wrap the avatar circle + name in `<Link href="/my-glow/profile" aria-label="My profile" className="flex items-center gap-3 rounded-full hover:opacity-80">…</Link>`; staff keep the current non-link markup. The circle renders the photo when present:

```tsx
<span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-semibold text-coral-dark">
  {user.avatarUrl ? (
    <Image src={user.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
  ) : (
    user.fullName.charAt(0)
  )}
</span>
```

Add `import Image from "next/image";` and `import Link from "next/link";` if missing. (Supabase storage host is already allowed in `next.config.ts` `images.remotePatterns`.)

- [ ] **Step 4:** `npx tsc --noEmit -p .`, eslint on changed files. **Commit** — `feat: client profile queries and header photo link`

---

### Task 4: My Profile page

**Files:** Create `src/app/my-glow/profile/page.tsx`, `src/components/my-glow/ProfileEditor.tsx`

**Consumes:** Task 2 validators/messages, Task 3 queries + event, `AvatarCropModal`, `loginRedirectPath`.

- [ ] **Step 1: Page**

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProfileEditor from "@/components/my-glow/ProfileEditor";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/myProfile";
import { loginRedirectPath } from "@/lib/loginRedirect";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(loginRedirectPath("/my-glow/profile"));

  const { data: roleRow } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!roleRow || roleRow.role !== "customer") redirect("/");

  const profile = await getMyProfile(supabase, auth.user.id);
  if (!profile) redirect("/my-glow");

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl space-y-4">
          <Link href="/my-glow" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to My Glow
          </Link>
          <ProfileEditor initial={profile} />
        </div>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: `ProfileEditor.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AvatarCropModal from "@/components/admin/users/AvatarCropModal";
import {
  GENDER_OPTIONS,
  PROFILE_MESSAGES,
  cleanAddress,
  formatPhoneForInput,
  normalizeName,
  normalizePhone,
  validateProfile,
  validatePhotoFile,
  type ProfileField,
  type ProfileForm,
} from "@/lib/profileValidation";
import {
  PROFILE_UPDATED_EVENT,
  removeMyAvatar,
  updateMyProfile,
  uploadMyAvatar,
  type MyProfile,
} from "@/lib/supabase/queries/myProfile";

const toForm = (p: MyProfile): ProfileForm => ({
  fullName: p.fullName ?? "",
  phone: formatPhoneForInput(p.phone),
  gender: p.gender ?? "",
  address: p.address ?? "",
});

const genderLabel = (g: string | null) => GENDER_OPTIONS.find((o) => o.value === g)?.label ?? "Not specified";

export default function ProfileEditor({ initial }: { initial: MyProfile }) {
  const [profile, setProfile] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileForm>(toForm(initial));
  const [touched, setTouched] = useState<Partial<Record<ProfileField, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const errors = validateProfile(form);
  const baseline = toForm(profile);
  const changed = (Object.keys(form) as ProfileField[]).some((k) => form[k] !== baseline[k]);
  const valid = Object.values(errors).every((e) => e === null);
  const fieldError = (k: ProfileField) => serverErrors[k] ?? (touched[k] ? errors[k] : null);

  function announce() {
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
  }

  function set(k: ProfileField, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setServerErrors((e) => ({ ...e, [k]: undefined }));
  }

  async function save() {
    setTouched({ fullName: true, phone: true, gender: true, address: true });
    if (!valid || !changed) return;
    setSaving(true);
    setNotice(null);
    const result = await updateMyProfile(createClient(), form);
    setSaving(false);
    if (result) {
      if (result.field) setServerErrors({ [result.field]: result.message });
      else setNotice({ kind: "error", text: result.message });
      return;
    }
    const next: MyProfile = {
      ...profile,
      fullName: normalizeName(form.fullName),
      phone: normalizePhone(form.phone) ?? form.phone,
      gender: form.gender || null,
      address: cleanAddress(form.address),
    };
    setProfile(next);
    setForm(toForm(next));
    setEditing(false);
    setTouched({});
    setNotice({ kind: "ok", text: PROFILE_MESSAGES.success });
    announce();
  }

  function cancel() {
    setForm(toForm(profile));
    setTouched({});
    setServerErrors({});
    setEditing(false);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = validatePhotoFile(file);
    if (problem) {
      setNotice({ kind: "error", text: problem });
      return;
    }
    setCropSrc(URL.createObjectURL(file));
  }

  async function onCropped(blob: Blob) {
    setCropSrc(null);
    setPhotoBusy(true);
    setNotice(null);
    const { url, error } = await uploadMyAvatar(createClient(), profile.id, blob, profile.avatarUrl);
    setPhotoBusy(false);
    if (error || !url) {
      setNotice({ kind: "error", text: error ?? PROFILE_MESSAGES.upload });
      return;
    }
    setProfile((p) => ({ ...p, avatarUrl: url }));
    setNotice({ kind: "ok", text: PROFILE_MESSAGES.success });
    announce();
  }

  async function removePhoto() {
    setConfirmRemove(false);
    setPhotoBusy(true);
    const error = await removeMyAvatar(createClient(), profile.id, profile.avatarUrl);
    setPhotoBusy(false);
    if (error) {
      setNotice({ kind: "error", text: error });
      return;
    }
    setProfile((p) => ({ ...p, avatarUrl: null }));
    setNotice({ kind: "ok", text: PROFILE_MESSAGES.success });
    announce();
  }

  const input = (k: ProfileField) =>
    `mt-1 w-full rounded-xl border px-3 py-2.5 text-base outline-none focus:border-coral ${
      fieldError(k) ? "border-red-400" : "border-ink/15"
    }`;

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm sm:p-8">
      {notice && (
        <p
          role="status"
          className={`mb-4 rounded-xl px-3 py-2 text-sm ${notice.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}
        >
          {notice.text}
        </p>
      )}

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
        <span className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-3xl font-bold text-coral-dark">
          {profile.avatarUrl ? (
            <Image src={profile.avatarUrl} alt="Your profile photo" fill sizes="96px" className="object-cover" />
          ) : (
            profile.fullName.charAt(0).toUpperCase()
          )}
        </span>
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-semibold text-ink">{profile.fullName}</h1>
          {profile.email && <p className="text-sm text-ink/50">{profile.email}</p>}
          {editing && (
            <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
              <button
                type="button"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink/70 hover:border-coral disabled:opacity-50"
              >
                <Camera className="h-4 w-4" /> {profile.avatarUrl ? "Change photo" : "Upload photo"}
              </button>
              {profile.avatarUrl &&
                (confirmRemove ? (
                  <span className="flex items-center gap-2 text-sm">
                    Remove photo?
                    <button type="button" onClick={removePhoto} className="font-semibold text-red-600">Yes</button>
                    <button type="button" onClick={() => setConfirmRemove(false)} className="text-ink/50">No</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={photoBusy}
                    onClick={() => setConfirmRemove(true)}
                    className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-sm font-medium text-red-600 hover:border-red-300 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" /> Remove photo
                  </button>
                ))}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickFile} />
            </div>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setNotice(null);
            }}
            className="flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark sm:ml-auto"
          >
            <Pencil className="h-4 w-4" /> Edit Profile
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="mt-6 divide-y divide-ink/5 rounded-2xl border border-ink/10 text-sm">
          {[
            ["Full name", profile.fullName],
            ["Phone", profile.phone ?? "Not set"],
            ["Gender", genderLabel(profile.gender)],
            ["Address", profile.address ?? "Not set"],
            ["Email", profile.email ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between">
              <dt className="text-ink/50">{k}</dt>
              <dd className="font-medium text-ink sm:text-right">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <form
          className="mt-6 space-y-4 pb-24 sm:pb-0"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          noValidate
        >
          <label className="block text-sm font-medium text-ink/70">
            Full name
            <input
              className={input("fullName")}
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, fullName: true }))}
              autoComplete="name"
              maxLength={80}
            />
            {fieldError("fullName") && <span className="mt-1 block text-xs text-red-600">{fieldError("fullName")}</span>}
          </label>

          <label className="block text-sm font-medium text-ink/70">
            Phone number
            <input
              className={input("phone")}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
              inputMode="tel"
              autoComplete="tel"
              placeholder="0917 123 4567"
              maxLength={16}
            />
            {fieldError("phone") && <span className="mt-1 block text-xs text-red-600">{fieldError("phone")}</span>}
          </label>

          <label className="block text-sm font-medium text-ink/70">
            Gender
            <select
              className={input("gender")}
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, gender: true }))}
            >
              <option value="">Not specified</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
            {fieldError("gender") && <span className="mt-1 block text-xs text-red-600">{fieldError("gender")}</span>}
          </label>

          <label className="block text-sm font-medium text-ink/70">
            Address
            <textarea
              className={input("address")}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, address: true }))}
              rows={3}
              maxLength={200}
              autoComplete="street-address"
              placeholder="Purok 3, Brgy. San Francisco, Pagadian City"
            />
            {fieldError("address") && <span className="mt-1 block text-xs text-red-600">{fieldError("address")}</span>}
          </label>

          <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-ink/10 bg-white p-4 pb-[calc(env(safe-area-inset-bottom)_+_16px)] sm:static sm:border-0 sm:p-0 sm:pt-2">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="flex-1 rounded-full border border-ink/15 py-3 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50 sm:flex-none sm:px-6"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !changed || !valid}
              className="flex-1 rounded-full bg-coral py-3 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-40 sm:flex-none sm:px-6"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {cropSrc && <AvatarCropModal src={cropSrc} onDone={onCropped} onCancel={() => setCropSrc(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit -p .`, eslint on new files; `curl` `/my-glow/profile` signed out → 307 to `/?login=1&next=%2Fmy-glow%2Fprofile`. **Commit** — `feat: My Profile page with edit form and photo upload`

---

### Task 5: Admin & Front Desk show profile fields, live

**Files:** Modify `src/app/api/admin/clients/route.ts`, `src/components/admin/users/types.ts`, `src/components/admin/users/ClientViewPanel.tsx`, `src/components/admin/users/UsersTable.tsx`, `src/lib/supabase/queries/frontdeskClients.ts`, `src/components/frontdesk/clients/ClientProfile.tsx`, `src/components/frontdesk/clients/ClientsManager.tsx`

- [ ] **Step 1: Admin API** — select `id, full_name, email, created_at, restricted, phone, gender, address, avatar_url`; map `phone`, `gender`, `address`, `avatarUrl`. Add those optional fields (`string | null`) to `ClientUser` in `types.ts`.
- [ ] **Step 2: `ClientViewPanel.tsx`** — circle shows `client.avatarUrl` via `next/image` (fill, `sizes="56px"`) or the initial; add rows Phone, Gender (label via `GENDER_OPTIONS`), Address (each "—" when empty) in the details block.
- [ ] **Step 3: `UsersTable.tsx`** — subscribe once (`[]` deps, unique topic `admin-clients-${crypto.randomUUID()}`) to `postgres_changes` `{ event: "UPDATE", schema: "public", table: "profiles" }` and call the existing client refetch (`fetchClients`, via a ref so the effect needn't depend on it); `removeChannel` on cleanup.
- [ ] **Step 4: Front Desk query** — add `gender, address, avatar_url` to the `getClients` select, `RawClientRow`, and `FrontDeskClient` (`gender`, `address`, `avatarUrl`).
- [ ] **Step 5: `ClientProfile.tsx`** — show the photo (or initial) and Gender/Address lines near phone/email.
- [ ] **Step 6: `ClientsManager.tsx`** — same Realtime subscription pattern as Step 3, reloading via `getClients`.
- [ ] **Step 7: Verify & commit** — tsc, eslint on changed files (no new errors vs baseline), `npm test`. `feat: admin and front desk show client profile details live`

---

### Task 6: Final checks

- [ ] `npm test && npx tsc --noEmit -p . && npm run lint && npm run build` — tests pass, lint at baseline (31 errors / 34 warnings), build OK.
- [ ] `grep -rn "dangerouslySetInnerHTML" src` → none for profile text.
- [ ] Deferred manual (after 050): edit profile on a phone-width screen; bad values show messages; save → "Profile updated ✓"; header photo updates; Admin tab refreshes live; booking form still saves a phone; check script all PASS.
