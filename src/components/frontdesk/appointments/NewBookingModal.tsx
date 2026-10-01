"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";
import { isProfessionalFreeNow } from "@/lib/supabase/queries/availability";
import { toAppointmentServiceRows } from "@/lib/bookedServices";
import ClientAccountSearch from "@/components/frontdesk/payments/ClientAccountSearch";
import type { ClientMatch } from "@/lib/walkinLinking";

type Service = { id: string; name: string; price: number; duration: string | null };
type Staff = { id: string; full_name: string };

/** "60 mins", "1 hr 30 mins", "90" → minutes (default 60). */
export function durationMinutes(text: string | null): number {
  const t = (text ?? "").toLowerCase();
  const h = Number(t.match(/(\d+)\s*(h|hr|hour)/)?.[1] ?? 0);
  const m = Number(t.match(/(\d+)\s*(m|min)/)?.[1] ?? 0);
  if (h || m) return h * 60 + m;
  const n = Number(t.match(/\d+/)?.[0] ?? 0);
  return n > 0 ? n : 60;
}

const field = "mt-1 w-full rounded-xl border border-nude bg-white px-3 py-2 text-sm text-ink outline-none focus:border-coral";

/** More than 5 minutes ago. */
function isPast(d: Date) {
  return d.getTime() < Date.now() - 5 * 60_000;
}

function newBookingCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function todayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** Front Desk → New Booking: book an appointment for a client (account or
 * guest) at this branch. Saved as Confirmed — the desk made it. */
export default function NewBookingModal({ branchId, onClose, onCreated }: { branchId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState("");
  const [linked, setLinked] = useState<ClientMatch | null>(null);
  const [phone, setPhone] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [serviceQuery, setServiceQuery] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(todayKey);
  const [time, setTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    Promise.all([
      supabase.from("branch_services").select("id, name, price, duration").eq("branch_id", branchId).eq("status", "Active").order("name"),
      supabase.from("staff_members").select("id, full_name").eq("branch_id", branchId).order("full_name"),
    ]).then(([s, st]) => {
      if (cancelled) return;
      logQueryError("NewBooking services", s.error);
      logQueryError("NewBooking staff", st.error);
      setServices((s.data ?? []) as Service[]);
      setStaff((st.data ?? []) as Staff[]);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const chosen = picked.map((id) => services.find((s) => s.id === id)).filter((s): s is Service => !!s);
  const total = chosen.reduce((sum, s) => sum + Number(s.price ?? 0), 0);
  const minutes = chosen.reduce((sum, s) => sum + durationMinutes(s.duration), 0);
  const filteredServices = useMemo(
    () => services.filter((s) => !serviceQuery.trim() || s.name.toLowerCase().includes(serviceQuery.toLowerCase())).slice(0, 60),
    [services, serviceQuery]
  );

  async function save() {
    setError(null);
    const clientName = linked?.fullName ?? name.trim();
    if (!clientName) return setError("Enter the client's name, or pick their account.");
    if (!linked && phone.replace(/\D/g, "").length < 10) return setError("Enter the guest's mobile number (10+ digits) so the spa can reach them.");
    if (chosen.length === 0) return setError("Choose at least one service.");
    if (!date || !time) return setError("Choose the date and time.");
    const start = new Date(`${date}T${time}:00+08:00`);
    if (isPast(start)) return setError("That time has already passed.");

    setSaving(true);
    const supabase = createClient();
    const startTime = `${time}:00`;
    if (staffId) {
      const free = await isProfessionalFreeNow(supabase, { professionalId: staffId, scheduledDate: date, startTime, durationMinutes: minutes });
      if (!free) {
        setSaving(false);
        return setError("That therapist already has a booking at this time. Pick another time or therapist.");
      }
    }
    const staffName = staff.find((s) => s.id === staffId)?.full_name ?? "any professional";
    const row: Record<string, unknown> = {
      booking_code: newBookingCode(),
      branch_id: branchId,
      client_id: linked?.id ?? null,
      walkin_name: linked ? null : clientName.slice(0, 80),
      walkin_phone: linked ? null : phone.trim().slice(0, 30),
      professional_id: staffId || null,
      service_id: chosen[0].id,
      appointment_type: "solo",
      scheduled_date: date,
      start_time: startTime,
      duration_minutes: minutes,
      status: "confirmed",
      notes: `${chosen.map((s) => s.name).join(", ")} with ${staffName} — ₱${total.toLocaleString()}.00`,
      staff_notes: notes.trim() || null,
    };
    let res = await supabase.from("appointments").insert({ ...row, visit_type: "appointment" }).select("id").single();
    if (res.error && isNotMigratedError(res.error)) res = await supabase.from("appointments").insert(row).select("id").single();
    if (res.error || !res.data) {
      setSaving(false);
      logQueryError("NewBooking insert", res.error);
      return setError(res.error?.message ?? "Couldn't save the booking.");
    }
    const id = (res.data as { id: string }).id;
    const { error: svcError } = await supabase.from("appointment_services").insert(toAppointmentServiceRows(id, chosen));
    if (svcError) logQueryError("NewBooking services list", svcError);
    setSaving(false);
    onCreated(id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-label="New booking">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-nude/70 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <CalendarPlus className="h-5 w-5 text-coral-dark" /> New Booking
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-ink">Client</p>
            <p className="text-xs text-ink/55">Type the name — pick their account if they have one, or continue as a guest.</p>
            <div className="mt-2">
              <ClientAccountSearch
                name={name}
                onNameChange={setName}
                linked={linked}
                onLink={(m) => setLinked(m)}
                onUnlink={() => setLinked(null)}
              />
            </div>
            {!linked && (
              <label className="mt-3 block text-sm font-medium text-ink/80">
                Mobile number (guest)
                <input value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 20))} placeholder="09XX XXX XXXX" className={field} />
              </label>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">Services</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-nude px-3 py-2">
              <Search className="h-4 w-4 text-ink/40" />
              <input value={serviceQuery} onChange={(e) => setServiceQuery(e.target.value)} placeholder="Search services…" className="w-full text-sm outline-none" />
            </div>
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-nude/60 p-2">
              {filteredServices.length === 0 ? (
                <p className="p-3 text-center text-sm text-ink/50">No services found.</p>
              ) : (
                filteredServices.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-cream">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-coral"
                      checked={picked.includes(s.id)}
                      onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                    />
                    <span className="flex-1 text-ink">{s.name}</span>
                    <span className="text-xs text-ink/55">{s.duration ?? "60 mins"}</span>
                    <span className="w-20 text-right font-medium text-ink">₱{Number(s.price ?? 0).toLocaleString()}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-ink/80">
              Therapist
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={field}>
                <option value="">Any professional</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-ink/80">
              Date
              <input type="date" value={date} min={todayKey()} onChange={(e) => setDate(e.target.value)} className={field} />
            </label>
            <label className="text-sm font-medium text-ink/80">
              Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
            </label>
          </div>

          <label className="block text-sm font-medium text-ink/80">
            Notes for staff <span className="font-normal text-ink/45">(optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 300))} className={field} placeholder="e.g. prefers a female therapist" />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-nude/70 px-6 py-4">
          <p className="text-sm text-ink/70">
            {chosen.length} service{chosen.length === 1 ? "" : "s"} · {minutes || 0} min ·{" "}
            <span className="font-semibold text-ink">₱{total.toLocaleString()}.00</span>
          </p>
          <div className="flex items-center gap-2">
            {error && (
              <p role="alert" className="max-w-xs text-sm text-red-600">
                {error}
              </p>
            )}
            <button type="button" onClick={onClose} className="rounded-full border border-nude px-4 py-2 text-sm text-ink/70">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50">
              {saving ? "Saving…" : "Create Booking"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
