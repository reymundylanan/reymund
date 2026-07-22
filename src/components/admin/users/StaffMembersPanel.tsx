"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import AvatarCropModal from "@/components/admin/users/AvatarCropModal";

type Branch = { id: string; name: string };

type StaffMember = {
  id: string;
  full_name: string;
  department: string;
  branch_id: string | null;
  phone: string | null;
  avatar_url: string | null;
  branches?: { name: string } | null;
};

const DEPARTMENTS = [
  "Nails",
  "Hair",
  "Clinic",
];

const empty = {
  full_name: "",
  department: DEPARTMENTS[0],
  branch_id: "",
  phone: "",
  avatar_url: "",
};

export default function StaffMembersPanel({ query = "" }: { query?: string }) {
  const supabase = createClient();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState(empty);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("staff_members")
      .select("*, branches(name)")
      .order("full_name");
    setMembers((data as StaffMember[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    supabase.from("branches").select("id, name").order("name")
      .then(({ data }) => setBranches(data ?? []));
  }, []);

  function openAdd() {
    setEditing(null);
    setForm(empty);
    setAvatarFile(null);
    setAvatarPreview(null);
    setMsg(null);
    setModalOpen(true);
  }

  function openEdit(m: StaffMember) {
    setEditing(m);
    setForm({
      full_name: m.full_name,
      department: m.department,
      branch_id: m.branch_id ?? "",
      phone: m.phone ?? "",
      avatar_url: m.avatar_url ?? "",
    });
    setAvatarFile(null);
    setAvatarPreview(null);
    setMsg(null);
    setModalOpen(true);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
    e.target.value = "";
  }

  function handleCropDone(blob: Blob) {
    const url = URL.createObjectURL(blob);
    setAvatarPreview(url);
    setAvatarFile(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
    setCropSrc(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    let avatar_url = form.avatar_url;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `staff/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });
      if (upErr) { setMsg(upErr.message); setSaving(false); return; }
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      avatar_url = urlData.publicUrl;
    }

    const payload = {
      full_name: form.full_name.trim(),
      department: form.department,
      branch_id: form.branch_id || null,
      phone: form.phone.trim() || null,
      avatar_url: avatar_url || null,
    };

    if (editing) {
      const { error } = await supabase.from("staff_members").update(payload).eq("id", editing.id);
      if (error) { setMsg(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("staff_members").insert(payload);
      if (error) { setMsg(error.message); setSaving(false); return; }
    }

    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this staff member?")) return;
    await supabase.from("staff_members").delete().eq("id", id);
    load();
  }

  const displayAvatar = avatarPreview ?? (editing?.avatar_url || null);

  const filtered = query.trim()
    ? members.filter((m) =>
        m.full_name.toLowerCase().includes(query.toLowerCase()) ||
        m.department.toLowerCase().includes(query.toLowerCase()) ||
        (m.branches as { name: string } | null)?.name?.toLowerCase().includes(query.toLowerCase())
      )
    : members;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-base text-ink/50">{members.length} staff member{members.length !== 1 ? "s" : ""}</p>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
        >
          <Plus className="h-4 w-4" /> Add Staff
        </button>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-ink/40">Loading...</p>
      ) : members.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink/40">No staff members yet.</p>
      ) : filtered.length === 0 && query.trim() ? (
        <p className="py-12 text-center text-sm text-ink/40">No staff members match your search.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-ink/10 text-sm font-semibold uppercase text-ink/40">
                <th className="px-4 py-3 text-left">Staff</th>
                <th className="px-4 py-3 text-left">Department</th>
                <th className="px-4 py-3 text-left">Branch</th>
                <th className="px-4 py-3 text-left">Phone</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-base font-bold text-coral-dark overflow-hidden">
                        {m.avatar_url
                          ? <Image src={m.avatar_url} alt={m.full_name} fill className="object-cover" />
                          : m.full_name.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium text-ink">{m.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-ink/60">{m.department}</td>
                  <td className="px-4 py-4 text-ink/60">
                    {(m.branches as { name: string } | null)?.name ?? <span className="text-ink/30">—</span>}
                  </td>
                  <td className="px-4 py-4 text-ink/60">{m.phone ?? <span className="text-ink/30">—</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(m)} className="rounded-lg p-2 text-ink/40 hover:bg-blush hover:text-coral-dark">
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button onClick={() => handleDelete(m.id)} className="rounded-lg p-2 text-ink/40 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{editing ? "Edit Staff" : "Add Staff Member"}</h2>
              <button onClick={() => setModalOpen(false)} className="text-ink/40 hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Avatar */}
            <div className="mt-5 flex justify-center">
              <div className="relative">
                <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-blush text-2xl font-bold text-coral-dark overflow-hidden">
                  {displayAvatar
                    ? <Image src={displayAvatar} alt="preview" fill className="object-cover" />
                    : (form.full_name.charAt(0).toUpperCase() || "?")}
                </span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-coral text-white shadow hover:bg-coral-dark"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </div>
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Full Name</label>
                <input
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Department</label>
                <select
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                >
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Branch</label>
                <select
                  required
                  value={form.branch_id}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                >
                  <option value="">— Select branch —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-ink/40">Phone Number</label>
                <input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                    let formatted = digits;
                    if (digits.startsWith("63")) {
                      const rest = digits.slice(2);
                      formatted = "+63 " + [rest.slice(0,3), rest.slice(3,6), rest.slice(6,10)].filter(Boolean).join(" ");
                    } else if (digits.startsWith("0")) {
                      const rest = digits.slice(1);
                      formatted = "0" + [rest.slice(0,3), rest.slice(3,6), rest.slice(6,10)].filter(Boolean).join(" ");
                    }
                    setForm({ ...form, phone: formatted.trim() });
                  }}
                  placeholder="+63 9XX XXX XXXX"
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                />
              </div>

              {msg && <p className="text-sm text-red-600">{msg}</p>}

              <div className="flex gap-3 border-t border-ink/10 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                >
                  {saving ? "Saving..." : editing ? "Save Changes" : "Add Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          onDone={handleCropDone}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}
