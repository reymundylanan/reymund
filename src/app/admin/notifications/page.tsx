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
      <div>
        <h1 className="text-2xl font-semibold text-ink">Notifications</h1>
        <p className="text-sm text-ink/50">Send an announcement to your clients by email and Messenger.</p>
      </div>
      <NotificationsManager
        initialRecipientCount={recipientCount}
        initialHistory={history}
        promos={promos}
        messenger={{ configured: messengerConfigured, missing: missingMessengerEnv(), ...audience, ...dispatch }}
        messengerResults={messengerResults}
      />
    </div>
  );
}
