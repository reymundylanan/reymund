import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActivePromoOptions,
  getBroadcastHistory,
  getEligibleRecipientCount,
} from "@/lib/supabase/queries/notificationBroadcasts";
import {
  getDispatchStatus,
  getMessengerAudience,
  getMessengerResultsByBroadcast,
} from "@/lib/supabase/queries/messenger";
import { getMessengerConfig, missingMessengerEnv } from "@/lib/messenger/config";
import NotificationsManager from "@/components/admin/notifications/NotificationsManager";
import FeedbackInbox from "@/components/admin/notifications/FeedbackInbox";
import AnnouncementCard from "@/components/admin/notifications/AnnouncementCard";

export default async function AdminNotificationsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();

  if (!profile || profile.role !== "admin") redirect("/admin");

  const messengerConfigured = getMessengerConfig() !== null;

  const [recipientCount, history, promos, audience, dispatch] = await Promise.all([
    getEligibleRecipientCount(supabase),
    getBroadcastHistory(supabase),
    getActivePromoOptions(supabase),
    messengerConfigured ? getMessengerAudience(createAdminClient()) : Promise.resolve({ connected: 0, reachableNow: 0 }),
    getDispatchStatus(supabase),
  ]);
  const messengerResults = await getMessengerResultsByBroadcast(
    supabase,
    history.map((h) => h.id)
  );

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-[28px] border border-[#e6d6b3] bg-[#fffdf8] px-7 py-8 shadow-[0_18px_40px_-34px_rgba(70,48,18,0.55)] sm:px-10 sm:py-10">
        {/* A second fine rule inside the first, like letter paper. */}
        <div aria-hidden className="pointer-events-none absolute inset-[7px] rounded-[22px] border border-[#f0e5cd]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.32em] text-coral-dark">
              <span aria-hidden className="h-px w-8 bg-coral-dark/50" />
              Client communication
            </p>
            <h1 className="mt-4 font-display text-[40px] font-normal leading-[1.05] tracking-[-0.015em] text-ink sm:text-[46px]">
              Notifications
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink/60">
              Send news and promos to your clients, keep the website announcement current, and read what clients tell you.
            </p>
          </div>

          <dl className="grid grid-cols-3 divide-x divide-[#eadcc0] border-t border-[#eadcc0] pt-6 lg:border-t-0 lg:pt-0">
            {[
              { label: "Reachable by email", value: recipientCount },
              { label: "On Messenger", value: messengerConfigured ? audience.connected : null },
              { label: "Broadcasts sent", value: history.length },
            ].map((s) => (
              <div key={s.label} className="px-5 first:pl-0 last:pr-0 lg:px-7">
                <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink/45">{s.label}</dt>
                <dd className="mt-2 font-display text-[32px] leading-none tabular-nums text-ink">
                  {s.value == null ? <span className="text-ink/25">—</span> : s.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
      <NotificationsManager
        initialRecipientCount={recipientCount}
        initialHistory={history}
        promos={promos}
        messenger={{ configured: messengerConfigured, missing: missingMessengerEnv(), ...audience, ...dispatch }}
        messengerResults={messengerResults}
        between={
          <>
            <AnnouncementCard />
            <FeedbackInbox />
          </>
        }
      />
    </div>
  );
}
