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
  return n.length >= 2 && n.length <= 80 && /^[\p{L} .'-]+$/u.test(n) && /\p{L}.*\p{L}/u.test(n)
    ? null
    : PROFILE_MESSAGES.fullName;
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
  const g = s.trim();
  return g === "" || GENDER_OPTIONS.some((o) => o.value === g) ? null : PROFILE_MESSAGES.gender;
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
