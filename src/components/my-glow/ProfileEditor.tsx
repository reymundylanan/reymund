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
