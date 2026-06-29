"use client";

import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import AppointmentDetailPanel from "@/components/frontdesk/appointments/AppointmentDetailPanel";

type ClientInfo = { full_name: string; phone: string | null };
type PaymentInfo = { method: string; status: string; amount: number };

type AppointmentRow = {
  id: string;
  booking_code: string | null;
  appointment_type: "solo" | "group";
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  notes: string | null;
  client: ClientInfo | ClientInfo[] | null;
  payments: PaymentInfo[] | null;
};

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  checked_in: "bg-blue-100 text-blue-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-ink/10 text-ink/50",
  no_show: "bg-red-100 text-red-600",
  conflict: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

function clientInfo(client: AppointmentRow["client"]): ClientInfo {
  if (!client) return { full_name: "—", phone: null };
  return Array.isArray(client) ? client[0] ?? { full_name: "—", phone: null } : client;
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${meridiem}`;
}

export default function AppointmentsListView() {
  const { profile } = useStaffProfile();
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("appointments")
      .select(
        "id, booking_code, appointment_type, scheduled_date, start_time, duration_minutes, status, notes, client:profiles(full_name, phone), payments(method, status, amount)"
      )
      .eq("branch_id", profile.branchId)
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true });

    setRows((data as unknown as AppointmentRow[]) ?? []);
    setLoading(false);
  }, [profile?.branchId]);

  useEffect(() => {
    if (!profile?.branchId) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    load();

    const channel = supabase
      .channel(`frontdesk-appointments-${profile.branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `branch_id=eq.${profile.branchId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as { notes: string | null };
            setToast(row.notes ? `New booking: ${row.notes}` : "New booking received.");
            setTimeout(() => setToast(null), 6000);
          }
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.branchId, load]);

  const activeAppointment = rows.find((r) => r.id === activeId);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-ink/40 shadow-sm">
        Loading appointments…
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl bg-white p-6 shadow-sm">
      {toast && (
        <div className="absolute -top-4 right-6 z-10 flex items-center gap-2 rounded-full bg-coral px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase text-ink/40">
            <th className="py-2">Client</th>
            <th className="py-2">Service / Note</th>
            <th className="py-2">Date</th>
            <th className="py-2">Time</th>
            <th className="py-2">Type</th>
            <th className="py-2">Status</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-ink/5">
              <td className="py-3 font-medium text-ink">
                {clientInfo(r.client).full_name}
              </td>
              <td className="py-3 text-ink/70">{r.notes ?? "—"}</td>
              <td className="py-3 text-ink/50">
                {new Date(r.scheduled_date).toLocaleDateString()}
              </td>
              <td className="py-3 text-ink/50">{formatTime(r.start_time)}</td>
              <td className="py-3 text-ink/50 capitalize">{r.appointment_type}</td>
              <td className="py-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    statusStyles[r.status] ?? "bg-ink/10 text-ink/50"
                  }`}
                >
                  {r.status.replace("_", " ")}
                </span>
              </td>
              <td className="py-3">
                <button
                  onClick={() => setActiveId(r.id)}
                  className="rounded-full p-2 text-ink/40 hover:bg-blush hover:text-ink"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-ink/40">
                No appointments for this branch yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {activeAppointment && (
        <AppointmentDetailPanel
          appointment={{
            id: activeAppointment.id,
            booking_code: activeAppointment.booking_code,
            appointment_type: activeAppointment.appointment_type,
            scheduled_date: activeAppointment.scheduled_date,
            start_time: activeAppointment.start_time,
            duration_minutes: activeAppointment.duration_minutes,
            status: activeAppointment.status,
            notes: activeAppointment.notes,
            clientName: clientInfo(activeAppointment.client).full_name,
            clientPhone: clientInfo(activeAppointment.client).phone,
            payment: activeAppointment.payments?.[0] ?? null,
          }}
          onClose={() => setActiveId(null)}
          onConfirmed={load}
        />
      )}
    </div>
  );
}
