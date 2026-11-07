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
import { Bell, Mail, MessageCircle, Send } from "lucide-react";
import PageHero, { HERO_CHIP } from "@/components/portal/PageHero";

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
      <PageHero
        icon={Bell}
        eyebrow="Client communication"
        title="Notifications"
        subtitle="Send news and promos to clients, manage the website announcement bar, and read client feedback."
        actions={[
          { icon: Mail, value: recipientCount, label: "by email" },
          ...(messengerConfigured ? [{ icon: MessageCircle, value: audience.connected, label: "on Messenger" }] : []),
          { icon: Send, value: history.length, label: history.length === 1 ? "broadcast sent" : "broadcasts sent" },
        ].map(({ icon: Icon, value, label }) => (
          <span key={label} className={HERO_CHIP}>
            <Icon className="h-4 w-4 text-coral-dark" aria-hidden />
            <span className="font-semibold text-ink">{value.toLocaleString()}</span>
            <span className="text-ink/50">{label}</span>
          </span>
        ))}
      />
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
