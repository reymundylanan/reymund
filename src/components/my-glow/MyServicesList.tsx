import Image from "next/image";
import type { RecentAppointment } from "@/lib/supabase/queries/myGlow";
import { getServiceImage } from "@/lib/serviceImage";

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-amber-100 text-amber-700",
  checked_in: "bg-blue-100 text-blue-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  no_show: "bg-red-100 text-red-600",
  conflict: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

const statusLabels: Record<string, string> = {
  pending: "Upcoming",
  confirmed: "Upcoming",
  checked_in: "Upcoming",
  in_service: "Upcoming",
  completed: "Completed",
  no_show: "No Show",
  conflict: "Conflict",
  cancelled: "Cancelled",
};

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "checked_in", "in_service"]);

function isPastDate(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return target.getTime() < today.getTime();
}

function displayStatus(status: string, scheduledDate: string) {
  // A booking left "confirmed"/"pending" past its date means staff never
  // updated it to completed/no-show — don't keep calling it "Upcoming".
  if (ACTIVE_STATUSES.has(status) && isPastDate(scheduledDate)) {
    return { label: "Past", style: "bg-ink/10 text-ink/50" };
  }
  return {
    label: statusLabels[status] ?? status,
    style: statusStyles[status] ?? "bg-ink/10 text-ink/50",
  };
}

export default function MyServicesList({
  appointments,
}: {
  appointments: RecentAppointment[];
}) {
  return (
    <div id="services" className="rounded-3xl border border-rose/60 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink">My Services</h3>
      </div>

      <div className="mt-4 space-y-3">
        {appointments.length === 0 && (
          <p className="py-6 text-center text-sm text-ink/40">No services booked yet.</p>
        )}
        {appointments.map((a) => {
          const status = displayStatus(a.status, a.scheduledDate);
          return (
            <div key={a.id} className="flex items-center gap-3">
              <Image
                src={getServiceImage(a.serviceName)}
                alt={a.serviceName ?? "Service"}
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 rounded-xl object-cover"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">{a.serviceName ?? "Appointment"}</p>
                <p className="text-xs text-ink/50">
                  {new Date(a.scheduledDate).toLocaleDateString()}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.style}`}
              >
                {status.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
