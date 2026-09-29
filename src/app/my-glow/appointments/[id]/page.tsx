import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, MapPin, Phone, User } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MessengerConnectCard from "@/components/notifications/MessengerConnectCard";
import { createClient } from "@/lib/supabase/server";
import { getClientAppointment } from "@/lib/supabase/queries/myGlow";
import { getMyMessengerStatus } from "@/lib/supabase/queries/messenger";
import { getMessengerConfig } from "@/lib/messenger/config";
import { loginRedirectPath } from "@/lib/loginRedirect";
import {
  appointmentStatusStyles,
  describeHistoryEvent,
  formatAppointmentDate,
  formatAppointmentTime,
  humanizeStatus,
} from "@/lib/appointmentFormat";

export const dynamic = "force-dynamic";

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(loginRedirectPath(`/my-glow/appointments/${id}`));

  const appt = await getClientAppointment(supabase, auth.user.id, id);
  if (!appt) notFound();

  const messengerEnabled = getMessengerConfig() !== null;
  const messengerStatus = messengerEnabled ? await getMyMessengerStatus(supabase, auth.user.id) : "none";

  const statusKey = appt.sessionStatus ?? appt.status;
  const badgeClass = appointmentStatusStyles[statusKey] ?? appointmentStatusStyles[appt.status] ?? "bg-ink/10 text-ink/50";

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link href="/my-glow" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to My Glow
          </Link>

          <div className="rounded-3xl bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-semibold text-ink">{appt.serviceName ?? "Appointment"}</h1>
              <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${badgeClass}`}>
                {humanizeStatus(statusKey)}
              </span>
            </div>

            <div className="mt-5 space-y-2 text-sm text-ink/70">
              <p className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-coral-dark" />
                {formatAppointmentDate(appt.scheduledDate)} · {formatAppointmentTime(appt.startTime)} ({appt.durationMinutes} min)
              </p>
              {appt.branchName && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-coral-dark" /> {appt.branchName}
                </p>
              )}
              {appt.professionalName && (
                <p className="flex items-center gap-2">
                  <User className="h-4 w-4 text-coral-dark" /> {appt.professionalName}
                </p>
              )}
              {appt.rescheduleCount > 0 && appt.originalScheduledDate && (
                <p className="text-ink/50">
                  Originally scheduled for {formatAppointmentDate(appt.originalScheduledDate)}
                  {appt.originalStartTime && <> · {formatAppointmentTime(appt.originalStartTime)}</>}
                </p>
              )}
              {appt.bookingCode && <p className="text-xs text-ink/40">Ref: {appt.bookingCode}</p>}
            </div>

            <p className="mt-6 flex items-center gap-1.5 border-t border-ink/10 pt-4 text-sm text-ink/60">
              <Phone className="h-4 w-4 shrink-0" />
              Need to change this? Call{" "}
              {appt.branchPhone ? (
                <a href={`tel:${appt.branchPhone}`} className="font-medium text-coral-dark underline">
                  {appt.branchPhone}
                </a>
              ) : (
                "your branch"
              )}
              .
            </p>
          </div>

          {appt.history.length > 0 && (
            <div className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="font-semibold text-ink">Timeline</h2>
              <ol className="mt-4 space-y-3 border-l border-rose/60 pl-4">
                {appt.history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <p className="text-ink">{describeHistoryEvent(h)}</p>
                    <p className="text-xs text-ink/40">
                      {new Date(h.createdAt).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {messengerEnabled && <MessengerConnectCard userId={auth.user.id} initialStatus={messengerStatus} />}
        </div>
      </main>
      <Footer />
    </>
  );
}
