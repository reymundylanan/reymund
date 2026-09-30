import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getAdminReviewStats,
  getReviewFilterOptions,
  listAdminReviews,
  parseReviewFilters,
} from "@/lib/supabase/queries/adminReviews";
import ReviewsManager from "@/components/admin/reviews/ReviewsManager";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  if (!profile || profile.role !== "admin") redirect("/admin");

  const filters = parseReviewFilters(await searchParams);
  const [list, stats, options] = await Promise.all([
    listAdminReviews(supabase, filters),
    getAdminReviewStats(supabase),
    getReviewFilterOptions(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Reviews</h1>
        <p className="text-sm text-ink/50">Service, staff and branch reviews from completed visits.</p>
      </div>
      <ReviewsManager initialFilters={filters} initialList={list} initialStats={stats} options={options} />
    </div>
  );
}
