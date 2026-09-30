import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRewardSettings, getRewardStats, listRewardQueue } from "@/lib/supabase/queries/adminRewards";
import RewardsManager from "@/components/admin/reviews/RewardsManager";

export const dynamic = "force-dynamic";

export default async function AdminRewardsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || profile.role !== "admin") redirect("/admin");

  const [queue, settings, stats] = await Promise.all([
    listRewardQueue(supabase),
    getRewardSettings(supabase),
    getRewardStats(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Review Rewards</h1>
        <p className="text-sm text-ink/50">Approve uncertain AI grades, retry failed evaluations and tune the GlowPoints rubric.</p>
      </div>
      <RewardsManager initialQueue={queue} initialSettings={settings} initialStats={stats} />
    </div>
  );
}
