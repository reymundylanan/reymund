"use client";

import { Bell, Camera, X } from "lucide-react";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

export default function StaffTopbar() {
  const { profile } = useStaffProfile();
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function openProfile() {
    setFullName(profile?.fullName ?? "");
    setCurrentPassword("");
    setNewPassword("");
    setAvatarPreview(null);
    setAvatarFile(null);
    setMsg(null);
    setProfileOpen(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMsg({ type: "err", text: "Not authenticated." }); setSaving(false); return; }

    // Upload avatar
    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${user.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });
      if (uploadErr) { setMsg({ type: "err", text: uploadErr.message }); setSaving(false); return; }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", user.id);
    }

    // Change password
    if (newPassword) {
      if (!currentPassword) {
        setMsg({ type: "err", text: "Enter current password to change it." });
        setSaving(false); return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email!, password: currentPassword,
      });
      if (signInErr) { setMsg({ type: "err", text: "Current password is incorrect." }); setSaving(false); return; }
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
      if (pwErr) { setMsg({ type: "err", text: pwErr.message }); setSaving(false); return; }
    }

    // Update name
    if (fullName.trim() && fullName.trim() !== profile?.fullName) {
      const { error: nameErr } = await supabase
        .from("profiles").update({ full_name: fullName.trim() }).eq("id", user.id);
      if (nameErr) { setMsg({ type: "err", text: nameErr.message }); setSaving(false); return; }
    }

    setMsg({ type: "ok", text: "Profile updated. Refresh to see changes." });
    setSaving(false);
    setCurrentPassword("");
    setNewPassword("");
  }

  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const displayAvatar = profile?.avatarUrl;

  return (
    <>
      <header className="flex items-center justify-between border-b border-ink/10 bg-white px-8 py-6">
        <div>
          <p className="text-2xl font-bold text-ink">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
            <span className="text-coral-dark">{profile?.fullName ?? "Staff"}</span>
          </p>
          <p className="mt-1 text-base text-ink/40">{today}</p>
        </div>

        <div className="flex items-center gap-5">
          <span className="rounded-full bg-blush px-5 py-2.5 text-base font-semibold text-coral-dark">
            {profile?.branchName ?? "Branch not assigned"}
          </span>

          <div className="relative">
            <button
              onClick={() => setBellOpen((o) => !o)}
              className="relative rounded-full p-2.5 text-ink/70 hover:bg-blush"
            >
              <Bell className="h-6 w-6" />
            </button>
            {bellOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-ink/10 bg-white p-4 shadow-lg z-10">
                <p className="px-1 pb-2 text-base font-semibold text-ink">Announcements</p>
                <p className="px-1 py-4 text-center text-base text-ink/40">No new announcements.</p>
              </div>
            )}
          </div>

          <button onClick={openProfile} className="flex items-center gap-3 rounded-xl px-2 py-1 hover:bg-blush transition">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blush text-lg font-bold text-coral-dark overflow-hidden">
              {displayAvatar
                ? <Image src={displayAvatar} alt="avatar" fill className="object-cover" />
                : profile?.fullName?.charAt(0) ?? "S"}
            </span>
            <div className="text-left">
              <p className="text-lg font-bold text-ink">{profile?.fullName ?? "—"}</p>
              <p className="text-base text-ink/50">Specialist</p>
            </div>
          </button>
        </div>
      </header>

      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Edit Profile</h2>
              <button onClick={() => setProfileOpen(false)} className="text-ink/40 hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Avatar upload */}
            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="relative">
                <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-blush text-3xl font-bold text-coral-dark overflow-hidden">
                  {avatarPreview
                    ? <Image src={avatarPreview} alt="preview" fill className="object-cover" />
                    : displayAvatar
                    ? <Image src={displayAvatar} alt="avatar" fill className="object-cover" />
                    : profile?.fullName?.charAt(0) ?? "S"}
                </span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-coral text-white shadow hover:bg-coral-dark"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              <div className="text-center">
                <p className="font-semibold text-ink">{profile?.fullName}</p>
                <p className="text-sm text-ink/50">Specialist · {profile?.branchName}</p>
              </div>
            </div>

            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Full Name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                />
              </div>

              <div className="border-t border-ink/10 pt-4">
                <p className="mb-3 text-xs font-medium uppercase text-ink/40">Change Password</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-ink/40">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ink/40">New Password</label>
                    <input
                      type="password"
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                    />
                  </div>
                </div>
              </div>

              {msg && (
                <p className={`text-sm ${msg.type === "ok" ? "text-green-600" : "text-red-600"}`}>
                  {msg.text}
                </p>
              )}

              <div className="flex gap-3 border-t border-ink/10 pt-4">
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:border-coral"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
