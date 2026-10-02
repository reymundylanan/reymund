"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Check, ChevronRight, UserPlus2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";
import { getBusyProfessionalIds, isProfessionalFreeNow } from "@/lib/supabase/queries/availability";
import { createWalkinAppointment, linkWalkinClient, searchClientAccounts } from "@/lib/supabase/queries/walkins";
import { getUnavailableStatusIds } from "@/lib/supabase/queries/staffAttendance";
import ClientAccountSearch, { ClientAvatar, ClientFoundDialog } from "@/components/frontdesk/payments/ClientAccountSearch";
import { findPossibleDuplicates, phoneHint, providerLabel, type ClientMatch } from "@/lib/walkinLinking";
import { toAppointmentServiceRows } from "@/lib/bookedServices";
import { logQueryError } from "@/lib/supabase/logQueryError";

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
  // Several services from the same category, all with one therapist.
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [therapistId, setTherapistId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<ClientMatch | null>(null);
  const [possibleMatches, setPossibleMatches] = useState<ClientMatch[] | null>(null);
  const [confirmMatch, setConfirmMatch] = useState<ClientMatch | null>(null);

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
      setServiceIds([]);

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
  // In the order they're listed, so the first one becomes the main service.
  const selectedServices = useMemo(
    () => filteredServices.filter((s) => serviceIds.includes(s.id)),
    [filteredServices, serviceIds]
  );
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const totalMinutes = selectedServices.reduce((sum, s) => sum + parseDurationMinutes(s.duration), 0);

  function toggleService(id: string) {
    setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  useEffect(() => {
    if (!profile?.branchId || totalMinutes === 0) {
      setBusyStaffIds(new Set());
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    getBusyProfessionalIds(supabase, {
      branchId: profile.branchId,
      scheduledDate: toDateKey(new Date()),
      startTime: nowTimeString(),
      durationMinutes: totalMinutes,
    }).then((ids) => {
      if (!cancelled) setBusyStaffIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.branchId, totalMinutes]);

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
    setServiceIds([]);
    setTherapistId(null);
  }

  function handleCategoryChange(nextCat: string) {
    setCategory(nextCat);
    setServiceIds([]);
  }

  // A linked client's number comes from their account when left blank.
  const canProceed =
    fullName.trim().length > 0 &&
    (linked !== null || mobileNumber.trim().length >= 7) &&
    selectedServices.length > 0 &&
    !!therapistId;

  /** Before registering an unlinked walk-in, look for an account that is
   * probably the same person (same name, or same full mobile number). */
  async function findDuplicates(): Promise<ClientMatch[]> {
    const supabase = createClient();
    const searches = [searchClientAccounts(supabase, fullName.trim())];
    if (mobileNumber.replace(/\D/g, "").length >= 10) searches.push(searchClientAccounts(supabase, mobileNumber));
    const results = await Promise.all(searches);
    const byId = new Map<string, ClientMatch>();
    for (const r of results) if (r.status === "ok") for (const m of r.matches) byId.set(m.id, m);
    return findPossibleDuplicates([...byId.values()], fullName, mobileNumber);
  }

  async function handleProceed(skipDuplicateCheck = false) {
    if (!profile?.branchId || selectedServices.length === 0 || !therapistId) return;
    const therapist = staff.find((t) => t.id === therapistId);
    if (!therapist) return;

    setSaving(true);
    setError(null);

    if (!linked && !skipDuplicateCheck) {
      const dupes = await findDuplicates();
      if (dupes.length > 0) {
        setPossibleMatches(dupes);
        setSaving(false);
        return;
      }
    }

    const supabase = createClient();
    const durationMinutes = totalMinutes;
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

    const { id: appointmentId, error: createError } = await createWalkinAppointment(supabase, {
      branchId: profile.branchId,
      professionalId: therapistId,
      serviceId: selectedServices[0].id,
      scheduledDate: todayKey,
      startTime,
      durationMinutes,
      walkinName: fullName.trim(),
      walkinPhone: mobileNumber.trim(),
      // The bill reads the total from here (see walkinQuotedAmount).
      notes: `${selectedServices.map((s) => s.name).join(", ")} with ${therapist.full_name} — ₱${totalPrice.toLocaleString()}.00`,
    });

    if (createError || !appointmentId) {
      setSaving(false);
      setError(createError ?? "Failed to register walk-in.");
      return;
    }

    const { error: svcError } = await supabase.from("appointment_services").insert(toAppointmentServiceRows(appointmentId, selectedServices));
    if (svcError) logQueryError("Walk-in services list", svcError);

    const linkError = linked ? await linkWalkinClient(supabase, appointmentId, linked.id) : null;
    setSaving(false);
    setError(linkError);

    setFullName("");
    setMobileNumber("");
    setTherapistId(null);
    setServiceIds([]);
    setLinked(null);
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
          <ClientAccountSearch
            name={fullName}
            onNameChange={setFullName}
            linked={linked}
            onLink={(m) => {
              setLinked(m);
              setFullName(m.fullName);
            }}
            onUnlink={() => setLinked(null)}
          />

          <div>
            <label className="text-xs font-medium text-ink/60">
              Mobile Number
              {linked && <span className="font-normal text-ink/40"> (optional — uses the number on their account)</span>}
            </label>
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
            <label className="flex items-baseline justify-between text-xs font-medium text-ink/60">
              <span>Services</span>
              <span className="font-normal text-ink/40">Tap to select one or more</span>
            </label>
            {filteredServices.length === 0 ? (
              <p className="mt-1 rounded-lg border border-ink/15 bg-ink/5 px-3 py-2 text-sm text-ink/50">No services in this category</p>
            ) : (
              <div className="mt-1 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {filteredServices.map((s) => {
                  const on = serviceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggleService(s.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${
                        on ? "border-coral bg-blush/60" : "border-ink/15 hover:border-coral/60"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on ? "border-coral bg-coral text-white" : "border-ink/30 bg-white"
                        }`}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink">{s.name}</span>
                        {s.duration && <span className="block text-xs text-ink/45">{s.duration}</span>}
                      </span>
                      <span className="shrink-0 font-medium text-ink/80">₱{s.price.toLocaleString()}.00</span>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedServices.length > 0 && (
              <p className="mt-2 flex justify-between rounded-lg bg-cream px-3 py-2 text-xs text-ink/70">
                <span>
                  {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} · about {totalMinutes} mins
                </span>
                <span className="font-semibold text-ink">Total ₱{totalPrice.toLocaleString()}.00</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-ink/60">
              Assigned Therapist
              {selectedServices.length > 1 && <span className="font-normal text-ink/40"> (does all selected services)</span>}
            </label>
            {availableTherapists.length === 0 ? (
              <p className="mt-2 text-xs text-red-600">
                No {department} staff free{totalMinutes ? ` for ${totalMinutes} mins` : ""} right now — check Staff Schedule.
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
            onClick={() => handleProceed()}
            disabled={!canProceed || saving}
            className="w-full rounded-full bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-pink-600 disabled:opacity-40"
          >
            {saving ? "Checking In..." : "Check In"}
          </button>
        </div>
      )}

      {possibleMatches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="possible-client-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 id="possible-client-title" className="font-semibold text-ink">
              Possible Existing Client
            </h3>
            <p className="mt-1 text-xs text-ink/60">
              An account with the same name or mobile number already exists. Ask the client whether it&apos;s theirs.
            </p>
            <ul className="mt-3 space-y-2">
              {possibleMatches.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl border border-ink/10 p-2.5">
                  <ClientAvatar match={m} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{m.fullName}</p>
                    <p className="truncate text-xs text-ink/50">
                      {[m.emailMasked ?? providerLabel(m.provider), phoneHint(m.phoneLast4)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    onClick={() => setConfirmMatch(m)}
                    className="rounded-full border border-pink-300 px-3 py-1 text-xs font-semibold text-pink-600 hover:bg-pink-50"
                  >
                    Use This Account
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPossibleMatches(null)}
                className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30"
              >
                Back
              </button>
              <button
                onClick={() => {
                  setPossibleMatches(null);
                  handleProceed(true);
                }}
                className="flex-1 rounded-full bg-pink-500 py-2 text-sm font-semibold text-white hover:bg-pink-600"
              >
                Continue Without Linking
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmMatch && (
        <ClientFoundDialog
          match={confirmMatch}
          onCancel={() => setConfirmMatch(null)}
          onLink={() => {
            setLinked(confirmMatch);
            setFullName(confirmMatch.fullName);
            setConfirmMatch(null);
            setPossibleMatches(null);
          }}
        />
      )}
    </div>
  );
}
