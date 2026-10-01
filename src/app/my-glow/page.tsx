import { redirect } from "next/navigation";
import { loginRedirectPath } from "@/lib/loginRedirect";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/server";
import {
  getUpcomingAppointment,
  getRecentAppointments,
  getAppointmentForClient,
  getMyReviews,
  getVisitedBranches,
} from "@/lib/supabase/queries/myGlow";
import { getVisitReviews } from "@/lib/supabase/queries/visitReviews";
import UpcomingBookingCard from "@/components/my-glow/UpcomingBookingCard";
import MyBookingsSection from "@/components/my-glow/MyBookingsSection";
import MyServicesList from "@/components/my-glow/MyServicesList";
import MyRewardsCard from "@/components/my-glow/MyRewardsCard";
import { getMyRewards } from "@/lib/supabase/queries/rewards";
import { getRedemptionState, getMyVouchers } from "@/lib/supabase/queries/vouchers";
import WelcomeBanner from "@/components/my-glow/WelcomeBanner";
import GlowJourneyBanner from "@/components/my-glow/GlowJourneyBanner";
import ReviewsPanel from "@/components/my-glow/ReviewsPanel";
import AssistantPanel from "@/components/my-glow/AssistantPanel";
import RecommendedForYou from "@/components/my-glow/RecommendedForYou";
import { getRecommendationsForClient } from "@/lib/supabase/queries/recommendations";
import MessengerConnectCard from "@/components/notifications/MessengerConnectCard";
import { getMyMessengerStatus } from "@/lib/supabase/queries/messenger";
import { getMessengerConfig } from "@/lib/messenger/config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SECTIONS = [
  { label: "Upcoming", href: "#upcoming" },
  { label: "My Visits", href: "#services" },
  { label: "My Bookings", href: "#my-bookings" },
  { label: "Rewards", href: "#rewards" },
  { label: "My Reviews", href: "#reviews" },
  { label: "Assistant", href: "#assistant" },
];

export default async function MyGlowPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string | string[] }>;
}) {
  const { review } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const reviewId = typeof review === "string" && UUID_RE.test(review) ? review : undefined;
  if (!auth.user) {
    redirect(loginRedirectPath(reviewId ? `/my-glow?review=${encodeURIComponent(reviewId)}` : "/my-glow"));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, loyalty_points")
    .eq("id", auth.user.id)
    .single();

  if (!profile || profile.role !== "customer") redirect("/");

  const [upcoming, recent, myReviews, visitedBranches, visitReviews, rewards, redemption, vouchers] =
    await Promise.all([
      getUpcomingAppointment(supabase, auth.user.id),
      getRecentAppointments(supabase, auth.user.id),
      getMyReviews(supabase, auth.user.id),
      getVisitedBranches(supabase, auth.user.id),
      getVisitReviews(supabase, auth.user.id),
      getMyRewards(supabase, auth.user.id, profile.loyalty_points),
      getRedemptionState(supabase),
      getMyVouchers(supabase, auth.user.id),
    ]);

  if (reviewId && !recent.some((a) => a.id === reviewId)) {
    const linked = await getAppointmentForClient(supabase, auth.user.id, reviewId);
    if (linked) recent.push(linked);
  }

  let recommendBranchId = visitedBranches[0]?.id ?? null;
  if (!recommendBranchId) {
    const { data: defaultBranch } = await supabase.from("branches").select("id").eq("name", "One Cecilia Center").maybeSingle();
    recommendBranchId = defaultBranch?.id ?? null;
  }
  const recommendations = recommendBranchId
    ? await getRecommendationsForClient(supabase, auth.user.id, recommendBranchId)
    : [];

  const messengerEnabled = getMessengerConfig() !== null;
  const messengerStatus = messengerEnabled ? await getMyMessengerStatus(supabase, auth.user.id) : "none";

  return (
    <>
      <Header />
      <main className="flex-1 bg-cream px-4 py-10 sm:px-6">
        {/* Section links scroll to ids inside the cards; keep them clear of the sticky header. */}
        <div className="mx-auto max-w-7xl space-y-6 [&_[id]]:scroll-mt-28">
          <WelcomeBanner firstName={profile.full_name.split(" ")[0]} />

          <nav aria-label="My Glow sections" className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                className="rounded-full border border-nude bg-white px-4 py-1.5 text-sm font-medium text-ink/75 shadow-sm transition hover:border-coral hover:text-coral-dark"
              >
                {s.label}
              </a>
            ))}
          </nav>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            {/* Main: what's next, history, recommendations, then bookings. */}
            <div className="min-w-0 space-y-6">
              <div id="upcoming">
                <UpcomingBookingCard appointment={upcoming} />
              </div>
              <MyServicesList appointments={recent} clientId={auth.user.id} initialReviews={visitReviews} openReviewId={reviewId} />
              <RecommendedForYou recommendations={recommendations} />
              <MyBookingsSection userId={auth.user.id} />
            </div>

            {/* Side: AI assistant first, then rewards, reviews and updates. */}
            <aside className="min-w-0 space-y-6">
              <div id="assistant">
                <AssistantPanel firstName={profile.full_name.split(" ")[0]} />
              </div>
              <MyRewardsCard
                key={`${rewards.balance}-${rewards.history[0]?.id ?? ""}-${vouchers.map((v) => `${v.id}${v.status}`).join(",")}`}
                initial={rewards}
                clientId={auth.user.id}
                redemption={redemption}
                vouchers={vouchers}
              />
              <ReviewsPanel myReviews={myReviews} />
              {messengerEnabled && <MessengerConnectCard userId={auth.user.id} initialStatus={messengerStatus} />}
            </aside>
          </div>

          <GlowJourneyBanner />
        </div>
      </main>
      <Footer />
    </>
  );
}
