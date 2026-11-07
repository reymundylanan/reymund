"use client";

import { useState } from "react";
import { Building2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const field =
  "mt-1.5 w-full rounded-xl border border-[#e8dcc0] bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-coral focus:ring-2 focus:ring-coral/15";
const label = "block text-sm font-medium text-ink/75";

/** "13:30" → "1:30 PM" (the format branch hours are stored and read in). */
export function to12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * Admin → Branches & Services → Add New Branch. Saves the branch so it shows
 * up everywhere branches are listed (booking, Multi-Branch, the website).
 * Names must be unique: services, staff and promotions find a branch by name.
 */
export default function AddBranchModal({
  existingNames,
  regions,
  onClose,
  onCreated,
}: {
  existingNames: string[];
  regions: string[];
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    address: "",
    region: regions[0] ?? "",
    phone: "",
    email: "",
    open: "08:00",
    close: "19:00",
    status: "active",
    facebook: "",
    instagram: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim().replace(/\s+/g, " ");
    if (name.length < 3) return setError("Enter the branch name.");
    if (existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) return setError(`There's already a branch called "${name}".`);
    if (form.address.trim().length < 5) return setError("Enter the branch address.");
    if (form.close <= form.open) return setError("Closing time must be after opening time.");
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError("That email address doesn't look right.");

    setSaving(true);
    setError(null);
    const { error: insertError } = await createClient()
      .from("branches")
      .insert({
        name,
        address: form.address.trim(),
        region: form.region.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        hours: `${to12h(form.open)} - ${to12h(form.close)}`,
        status: form.status,
        facebook: form.facebook.trim() || null,
        facebook_label: form.facebook.trim() ? name : null,
        instagram: form.instagram.trim().replace(/^@/, "") || null,
        instagram_label: form.instagram.trim().replace(/^@/, "") || null,
      });
    setSaving(false);
    if (insertError) {
      setError(
        insertError.code === "42501"
          ? "Only an Admin can add branches."
          : insertError.code === "23505"
            ? `There's already a branch called "${name}".`
            : insertError.message
      );
      return;
    }
    onCreated(name);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
        aria-label="Add new branch"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#f8efd9] text-coral-dark">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">Add New Branch</h2>
              <p className="text-sm text-ink/55">You can add its services, staff and photo after saving.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink/40 hover:bg-cream hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className={label}>
            Branch name *
            <input value={form.name} onChange={set("name")} placeholder="e.g. KCC Mall de Zamboanga" maxLength={80} className={field} autoFocus />
          </label>
          <label className={label}>
            Address *
            <textarea value={form.address} onChange={set("address")} rows={2} placeholder="Floor, building, street, city, province" className={field} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Region
              <input value={form.region} onChange={set("region")} list="branch-regions" placeholder="e.g. Mindanao" className={field} />
              <datalist id="branch-regions">
                {regions.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <label className={label}>
              Status
              <select value={form.status} onChange={set("status")} className={field}>
                <option value="active">Active — open for bookings</option>
                <option value="inactive">Inactive — not open yet</option>
              </select>
            </label>
            <label className={label}>
              Opens
              <input type="time" value={form.open} onChange={set("open")} className={field} />
            </label>
            <label className={label}>
              Closes
              <input type="time" value={form.close} onChange={set("close")} className={field} />
            </label>
            <label className={label}>
              Phone
              <input type="tel" value={form.phone} onChange={set("phone")} placeholder="e.g. 0917 123 4567" maxLength={30} className={field} />
            </label>
            <label className={label}>
              Email
              <input type="email" value={form.email} onChange={set("email")} placeholder="branch@example.com" className={field} />
            </label>
            <label className={label}>
              Facebook page
              <input value={form.facebook} onChange={set("facebook")} placeholder="page name after facebook.com/" className={field} />
            </label>
            <label className={label}>
              Instagram
              <input value={form.instagram} onChange={set("instagram")} placeholder="@handle" className={field} />
            </label>
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:border-ink/30">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex-1 rounded-full bg-coral px-4 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50">
            {saving ? "Saving…" : "Add branch"}
          </button>
        </div>
      </form>
    </div>
  );
}
