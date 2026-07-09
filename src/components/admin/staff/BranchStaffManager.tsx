"use client";

import { useState } from "react";
import { Plus, Trash2, UserCog } from "lucide-react";
import { adminBranches } from "@/lib/adminData";

type StaffMember = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  branchId: string;
};

const roles = ["Therapist", "Aesthetician", "Front Desk", "Supervisor", "Manager"];

const initialStaff: StaffMember[] = [];

export default function BranchStaffManager() {
  const [staff, setStaff] = useState<StaffMember[]>(initialStaff);
  const [activeBranch, setActiveBranch] = useState(adminBranches[0].id);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", role: roles[0], email: "", phone: "" });

  const branchStaff = staff.filter((s) => s.branchId === activeBranch);

  function handleAdd() {
    if (!form.name.trim()) return;
    setStaff((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        branchId: activeBranch,
        name: form.name.trim(),
        role: form.role,
        email: form.email.trim(),
        phone: form.phone.trim(),
      },
    ]);
    setForm({ name: "", role: roles[0], email: "", phone: "" });
    setShowForm(false);
  }

  function handleRemove(id: string) {
    setStaff((prev) => prev.filter((s) => s.id !== id));
  }

  const activeBranchName = adminBranches.find((b) => b.id === activeBranch)?.name ?? "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Branches &amp; Staff</h1>
            <p className="text-sm text-ink/50">
              Manage staff members assigned to each branch location.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
          >
            <Plus className="h-4 w-4" /> Add Staff
          </button>
        </div>

        {/* Branch tabs */}
        <div className="mt-5 flex gap-2">
          {adminBranches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => { setActiveBranch(branch.id); setShowForm(false); }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeBranch === branch.id
                  ? "bg-coral text-white"
                  : "border border-ink/15 text-ink/70 hover:border-coral"
              }`}
            >
              {branch.name} ({staff.filter((s) => s.branchId === branch.id).length})
            </button>
          ))}
        </div>
      </div>

      {/* Add staff form */}
      {showForm && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-ink">New Staff — {activeBranchName}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase text-ink/40">Full Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Maria Santos"
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-ink/40">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              >
                {roles.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-ink/40">Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="staff@email.com"
                type="email"
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase text-ink/40">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+63 9XX XXX XXXX"
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="rounded-full border border-ink/15 px-5 py-2 text-sm font-medium text-ink/70 hover:border-coral"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
            >
              Save Staff
            </button>
          </div>
        </div>
      )}

      {/* Staff list */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="border-b border-ink/10 px-6 py-4">
          <h2 className="font-semibold text-ink">{activeBranchName}</h2>
          <p className="text-sm text-ink/50">{branchStaff.length} staff member{branchStaff.length !== 1 ? "s" : ""}</p>
        </div>

        {branchStaff.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <UserCog className="h-10 w-10 text-ink/20" />
            <p className="text-sm text-ink/40">No staff added yet for this branch.</p>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
            >
              + Add First Staff Member
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs font-medium uppercase text-ink/40">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {branchStaff.map((s) => (
                <tr key={s.id} className="border-b border-ink/5 last:border-0 hover:bg-blush/30">
                  <td className="px-6 py-4 font-medium text-ink">{s.name}</td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-blush px-2.5 py-1 text-xs font-medium text-coral-dark">
                      {s.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-ink/60">{s.email || "—"}</td>
                  <td className="px-6 py-4 text-ink/60">{s.phone || "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRemove(s.id)}
                      className="rounded-lg p-1.5 text-ink/30 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
