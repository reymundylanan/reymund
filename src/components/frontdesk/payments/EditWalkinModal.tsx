"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronRight, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { getBusyProfessionalIds } from "@/lib/supabase/queries/availability";
import { updateWalkinAppointment, type WalkinRow } from "@/lib/supabase/queries/walkins";

type BranchService = {
  id: string;
  name: string;
  department: string;
  category: string;
  price: number;
  duration: string;
};

type StaffOption = {
  id: string;
  full_name: string;
  department: string;
  avatar_url: string | null;
};

function parseDurationMinutes(durationLabel: string | null | undefined) {
  if (!durationLabel) return 60;
  const minutesMatch = durationLabel.match(/(\d+)\s*mins?/);
  const hoursMatch = durationLabel.match(/(\d+)\s*hour/);
  return minutesMatch ? parseInt(minutesMatch[1], 10) : hoursMatch ? parseInt(hoursMatch[1], 10) * 60 : 60;
}

export default function EditWalkinModal({
  walkin,
  onClose,
  onSaved,
}: {
  walkin: WalkinRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useStaffProfile();
  const [fullName, setFullName] = useState(walkin.walkin_name ?? "");
  const [mobileNumber, setMobileNumber] = useState(walkin.walkin_phone ?? "");
  const [services, setServices] = useState<BranchService[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [offStaffIds, setOffStaffIds] = useState<Set<string>>(new Set());
  const [busyStaffIds, setBusyStaffIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [serviceId, setServiceId] = useState(walkin.service_id ?? "");
  const [therapistId, setTherapistId] = useState<string | null>(walkin.professional_id);
  const [startTime, setStartTime] = useState(walkin.start_time.slice(0, 5));
  const [additionalCharges, setAdditionalCharges] = useState(String(walkin.additional_charges || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      supabase
        .from("branch_services")
        .select("id, name, category, department, duration, price")
        .eq("branch_id", profile.branchId)
        .eq("status", "Active")
        .order("department")
        .order("category")
        .order("name"),
      supabase
        .from("staff_members")
        .select("id, full_name, department, avatar_url")
        .eq("branch_id", profile.branchId)
        .order("department")
        .order("full_name"),
      supabase
        .from("staff_shifts")
        .select("staff_member_id")
        .eq("branch_id", profile.branchId)
        .eq("shift_date", walkin.scheduled_date),
    ]).then(([svcRes, staffRes, offRes]) => {
      if (cancelled) return;
      const svcRows = (svcRes.data as BranchService[]) ?? [];
      setServices(svcRows);
      setStaff((staffRes.data as StaffOption[]) ?? []);
      setOffStaffIds(
        new Set(((offRes.data as { staff_member_id: string }[]) ?? []).map((r) => r.staff_member_id))
      );

      const currentService = svcRows.find((s) => s.id === walkin.service_id);
      if (currentService) {
        setDepartment(currentService.department);
        setCategory(currentService.category);
      } else if (svcRows.length > 0) {
        setDepartment(svcRows[0].department);
        setCategory(svcRows[0].category);
        setServiceId(svcRows[0].id);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId, walkin.scheduled_date, walkin.service_id]);

  const departments = useMemo(() => Array.from(new Set(services.map((s) => s.department))), [services]);
  const categories = useMemo(
    () => Array.from(new Set(services.filter((s) => s.department === department).map((s) => s.category))),
    [services, department]
  );
  const filteredServices = useMemo(
    () => services.filter((s) => s.department === department && s.category === category),
    [services, department, category]
  );
  const selectedService = services.find((s) => s.id === serviceId);

  useEffect(() => {
    if (!profile?.branchId || !selectedService) {
      setBusyStaffIds(new Set());
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    getBusyProfessionalIds(supabase, {
      branchId: profile.branchId,
      scheduledDate: walkin.scheduled_date,
      startTime: `${startTime}:00`,
      durationMinutes: parseDurationMinutes(selectedService.duration),
    }).then((ids) => {
      if (!cancelled) setBusyStaffIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId, selectedService?.id, selectedService?.duration, startTime, walkin.scheduled_date]);

  const availableTherapists = useMemo(
    () =>
      staff.filter(
        (s) =>
          s.department === department &&
          !offStaffIds.has(s.id) &&
          (!busyStaffIds.has(s.id) || s.id === walkin.professional_id)
      ),
    [staff, department, offStaffIds, busyStaffIds, walkin.professional_id]
  );

  function handleDepartmentChange(nextDept: string) {
    setDepartment(nextDept);
    const cats = Array.from(new Set(services.filter((s) => s.department === nextDept).map((s) => s.category)));
    const nextCat = cats[0] ?? "";
    setCategory(nextCat);
    const nextSvc = services.find((s) => s.department === nextDept && s.category === nextCat);
    setServiceId(nextSvc?.id ?? "");
    setTherapistId(null);
  }

  function handleCategoryChange(nextCat: string) {
    setCategory(nextCat);
    const nextSvc = services.find((s) => s.department === department && s.category === nextCat);
    setServiceId(nextSvc?.id ?? "");
  }

  const canSave = fullName.trim().length > 0 && mobileNumber.trim().length >= 7 && !!serviceId && !!therapistId;

  async function handleSave() {
    if (!selectedService || !therapistId) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const result = await updateWalkinAppointment(supabase, {
      appointmentId: walkin.id,
      professionalId: therapistId,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      servicePrice: selectedService.price,
      startTime: `${startTime}:00`,
      durationMinutes: parseDurationMinutes(selectedService.duration),
      walkinName: fullName.trim(),
      walkinPhone: mobileNumber.trim(),
      additionalCharges: Number(additionalCharges) || 0,
      scheduledDate: walkin.scheduled_date,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Edit Walk-In</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-6 w-6" />
          </button>
        </div>

        {loading ? (
          <p className="mt-6 py-8 text-center text-sm text-ink/40">Loading...</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-ink/60">Client Full Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-ink/60">Mobile Number</label>
              <input
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink/60">Department</label>
                <div className="relative mt-1">
                  <select
                    value={department}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 -rotate-90 text-ink/40" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-ink/60">Category</label>
                <div className="relative mt-1">
                  <select
                    value={category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 -rotate-90 text-ink/40" />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-ink/60">Service</label>
              <div className="relative mt-1">
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  disabled={filteredServices.length === 0}
                  className="w-full appearance-none rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral disabled:bg-ink/5"
                >
                  {filteredServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ₱{s.price.toLocaleString()}.00
                    </option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 -rotate-90 text-ink/40" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink/60">Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink/60">Additional Charges</label>
                <input
                  type="number"
                  value={additionalCharges}
                  onChange={(e) => setAdditionalCharges(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-ink/60">Assigned Therapist</label>
              {availableTherapists.length === 0 ? (
                <p className="mt-2 text-xs text-red-600">No {department} staff available for this time.</p>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {availableTherapists.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTherapistId(t.id)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 transition ${
                        therapistId === t.id ? "border-pink-400 bg-pink-50" : "border-ink/10 hover:border-pink-200"
                      }`}
                    >
                      <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-bold text-coral-dark">
                        {t.avatar_url ? (
                          <Image src={t.avatar_url} alt={t.full_name} fill className="object-cover" />
                        ) : (
                          t.full_name.charAt(0).toUpperCase()
                        )}
                      </span>
                      <span className="truncate text-xs font-medium text-ink/70">{t.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
