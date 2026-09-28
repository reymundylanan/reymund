"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronRight, UserPlus2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import { getBusyProfessionalIds, isProfessionalFreeNow } from "@/lib/supabase/queries/availability";
import { createWalkinAppointment } from "@/lib/supabase/queries/walkins";
import { getUnavailableStatusIds } from "@/lib/supabase/queries/staffAttendance";

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

function nowTimeString() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:00`;
}

export default function WalkinRegistrationPanel({ onRegistered }: { onRegistered: () => void }) {
  const { profile } = useStaffProfile();
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [services, setServices] = useState<BranchService[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [offStaffIds, setOffStaffIds] = useState<Set<string>>(new Set());
  const [busyStaffIds, setBusyStaffIds] = useState<Set<string>>(new Set());
  const [unavailableStatusIds, setUnavailableStatusIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [therapistId, setTherapistId] = useState<string | null>(null);
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
    const todayKey = toDateKey(new Date());
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
        .eq("shift_date", todayKey),
      getUnavailableStatusIds(supabase, profile.branchId, todayKey),
    ]).then(([svcRes, staffRes, offRes, unavailableIds]) => {
      if (cancelled) return;
      const svcRows = (svcRes.data as BranchService[]) ?? [];
      const staffRows = (staffRes.data as StaffOption[]) ?? [];
      const offIds = new Set(
        ((offRes.data as { staff_member_id: string }[]) ?? []).map((r) => r.staff_member_id)
      );
      setServices(svcRows);
      setStaff(staffRows);
      setOffStaffIds(offIds);
      setUnavailableStatusIds(unavailableIds);

      const depts = Array.from(new Set(svcRows.map((s) => s.department)));
      const firstDept = depts[0] ?? "";
      setDepartment(firstDept);
      const cats = Array.from(new Set(svcRows.filter((s) => s.department === firstDept).map((s) => s.category)));
      const firstCat = cats[0] ?? "";
      setCategory(firstCat);
      const firstSvc = svcRows.find((s) => s.department === firstDept && s.category === firstCat);
      setServiceId(firstSvc?.id ?? "");

      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId]);

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
      scheduledDate: toDateKey(new Date()),
      startTime: nowTimeString(),
      durationMinutes: parseDurationMinutes(selectedService.duration),
    }).then((ids) => {
      if (!cancelled) setBusyStaffIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId, selectedService?.id, selectedService?.duration]);

  const availableTherapists = useMemo(
    () =>
      staff.filter(
        (s) =>
          s.department === department &&
          !offStaffIds.has(s.id) &&
          !busyStaffIds.has(s.id) &&
          !unavailableStatusIds.has(s.id)
      ),
    [staff, department, offStaffIds, busyStaffIds, unavailableStatusIds]
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

  const canProceed =
    fullName.trim().length > 0 && mobileNumber.trim().length >= 7 && !!serviceId && !!therapistId;

  async function handleProceed() {
    if (!profile?.branchId || !selectedService || !therapistId) return;
    const therapist = staff.find((t) => t.id === therapistId);
    if (!therapist) return;

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const durationMinutes = parseDurationMinutes(selectedService.duration);
    const todayKey = toDateKey(new Date());
    const startTime = nowTimeString();

    const stillFree = await isProfessionalFreeNow(supabase, {
      professionalId: therapistId,
      scheduledDate: todayKey,
      startTime,
      durationMinutes,
    });
    if (!stillFree) {
      setError(`${therapist.full_name} was just booked elsewhere — pick another therapist.`);
      setSaving(false);
      return;
    }

    const { error: createError } = await createWalkinAppointment(supabase, {
      branchId: profile.branchId,
      professionalId: therapistId,
      serviceId: selectedService.id,
      scheduledDate: todayKey,
      startTime,
      durationMinutes,
      walkinName: fullName.trim(),
      walkinPhone: mobileNumber.trim(),
      notes: `${selectedService.name} with ${therapist.full_name} — ₱${selectedService.price.toLocaleString()}.00`,
    });

    setSaving(false);
    if (createError) {
      setError(`${createError} (service="${selectedService.name}" id=${selectedService.id})`);
      return;
    }

    setFullName("");
    setMobileNumber("");
    setTherapistId(null);
    onRegistered();
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
          <UserPlus2 className="h-4 w-4" />
        </span>
        Walk-in Registration
      </h2>
      <p className="mt-1 text-xs text-ink/50">
        Direct intake for clients without appointments
      </p>

      {loading ? (
        <p className="mt-6 py-8 text-center text-sm text-ink/40">Loading services...</p>
      ) : departments.length === 0 ? (
        <p className="mt-6 py-8 text-center text-sm text-ink/40">
          No active services found for this branch.
        </p>
      ) : (
        <div className="mt-4 space-y-4 border-t border-ink/10 pt-4">
          <div>
            <label className="text-xs font-medium text-ink/60">Client Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sofia Vergara"
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-ink/60">Mobile Number</label>
            <input
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
              placeholder="0917XXXXXXX"
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
                {filteredServices.length === 0 ? (
                  <option value="">No services in this category</option>
                ) : (
                  filteredServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ₱{s.price.toLocaleString()}.00
                    </option>
                  ))
                )}
              </select>
              <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 -rotate-90 text-ink/40" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-ink/60">Assigned Therapist</label>
            {availableTherapists.length === 0 ? (
              <p className="mt-2 text-xs text-red-600">
                No {department} staff available right now — check Staff Schedule.
              </p>
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

          <button
            onClick={handleProceed}
            disabled={!canProceed || saving}
            className="w-full rounded-full bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-600 disabled:opacity-40"
          >
            {saving ? "Registering..." : "Proceed to Payment"}
          </button>
        </div>
      )}
    </div>
  );
}
