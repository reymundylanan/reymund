import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEligibleRecipientCount, getBroadcastHistory } from "@/lib/supabase/queries/notificationBroadcasts";
import NotificationsManager from "@/components/admin/notifications/NotificationsManager";

export default async function AdminNotificationsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.role !== "admin") redirect("/admin");

  const [recipientCount, history] = await Promise.all([
    getEligibleRecipientCount(supabase),
    getBroadcastHistory(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Notifications</h1>
        <p className="text-sm text-ink/50">Send an announcement to every client by email.</p>
      </div>
      <NotificationsManager initialRecipientCount={recipientCount} initialHistory={history} />
    </div>
  );
}
