import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import {
  getUpcomingAppointment,
  getRecentAppointments,
  getReviewableProfessionals,
  getMyReviews,
  getDefaultBranch,
} from "@/lib/supabase/queries/myGlow";
import UpcomingBookingCard from "@/components/my-glow/UpcomingBookingCard";
import MyServicesList from "@/components/my-glow/MyServicesList";
import GlowRewardsCard from "@/components/my-glow/GlowRewardsCard";
import WelcomeBanner from "@/components/my-glow/WelcomeBanner";
import GlowJourneyBanner from "@/components/my-glow/GlowJourneyBanner";
import ReviewsPanel from "@/components/my-glow/ReviewsPanel";

export default async function MyGlowPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, loyalty_points")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.role !== "customer") redirect("/");

  const [upcoming, recent, reviewable, myReviews, defaultBranch] =
    await Promise.all([
      getUpcomingAppointment(supabase, auth.user.id),
      getRecentAppointments(supabase, auth.user.id),
      getReviewableProfessionals(supabase, auth.user.id),
      getMyReviews(supabase, auth.user.id),
      getDefaultBranch(supabase, auth.user.id),
    ]);

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-6 py-10">
        <div className="mx-auto max-w-4xl space-y-6">
          <WelcomeBanner firstName={profile.full_name.split(" ")[0]} />
          <UpcomingBookingCard appointment={upcoming} />
          <MyServicesList appointments={recent} />
          <GlowRewardsCard points={profile.loyalty_points} />
          <ReviewsPanel
            clientId={auth.user.id}
            reviewable={reviewable}
            defaultBranch={defaultBranch}
            myReviews={myReviews}
          />
          <GlowJourneyBanner />
        </div>
      </main>
      <Footer />
    </>
  );
}
