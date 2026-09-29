import { redirect } from "next/navigation";
import { loginRedirectPath } from "@/lib/loginRedirect";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import {
  getUpcomingAppointment,
  getRecentAppointments,
  getReviewableProfessionals,
  getMyReviews,
  getVisitedBranches,
  getServiceReviews,
} from "@/lib/supabase/queries/myGlow";
import UpcomingBookingCard from "@/components/my-glow/UpcomingBookingCard";
import MyBookingsSection from "@/components/my-glow/MyBookingsSection";
import MyServicesList from "@/components/my-glow/MyServicesList";
import GlowRewardsCard from "@/components/my-glow/GlowRewardsCard";
import WelcomeBanner from "@/components/my-glow/WelcomeBanner";
import GlowJourneyBanner from "@/components/my-glow/GlowJourneyBanner";
import ReviewsPanel from "@/components/my-glow/ReviewsPanel";
import AssistantPanel from "@/components/my-glow/AssistantPanel";
import PromoPopup from "@/components/my-glow/PromoPopup";
import { getPromoForClient } from "@/lib/supabase/queries/promos";
import RecommendedForYou from "@/components/my-glow/RecommendedForYou";
import { getRecommendationsForClient } from "@/lib/supabase/queries/recommendations";

export default async function MyGlowPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(loginRedirectPath("/my-glow"));

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, loyalty_points")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.role !== "customer") redirect("/");

  const [upcoming, recent, reviewable, myReviews, visitedBranches, promo, serviceReviews] =
    await Promise.all([
      getUpcomingAppointment(supabase, auth.user.id),
      getRecentAppointments(supabase, auth.user.id),
      getReviewableProfessionals(supabase, auth.user.id),
      getMyReviews(supabase, auth.user.id),
      getVisitedBranches(supabase, auth.user.id),
      getPromoForClient(supabase, auth.user.id),
      getServiceReviews(supabase, auth.user.id),
    ]);

  let recommendBranchId = visitedBranches[0]?.id ?? null;
  if (!recommendBranchId) {
    const { data: defaultBranch } = await supabase.from("branches").select("id").eq("name", "One Cecilia Center").maybeSingle();
    recommendBranchId = defaultBranch?.id ?? null;
  }
  const recommendations = recommendBranchId
    ? await getRecommendationsForClient(supabase, auth.user.id, recommendBranchId)
    : [];

  return (
    <>
      {promo && <PromoPopup clientId={auth.user.id} promo={promo} />}
      <Header />
      <main className="flex-1 bg-blush/30 px-6 py-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <WelcomeBanner firstName={profile.full_name.split(" ")[0]} />

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6">
              <UpcomingBookingCard appointment={upcoming} />
              <ReviewsPanel
                clientId={auth.user.id}
                reviewable={reviewable}
                visitedBranches={visitedBranches}
                myReviews={myReviews}
              />
            </div>
            <div className="space-y-6">
              <MyServicesList appointments={recent} clientId={auth.user.id} initialReviews={serviceReviews} />
              <GlowRewardsCard points={profile.loyalty_points} />
            </div>
            <AssistantPanel firstName={profile.full_name.split(" ")[0]} />
          </div>

          <RecommendedForYou recommendations={recommendations} />

          <MyBookingsSection userId={auth.user.id} />

          <GlowJourneyBanner />
        </div>
      </main>
      <Footer />
    </>
  );
}
