import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/components/home/Hero";
import Promotions from "@/components/home/Promotions";
import Services from "@/components/home/Services";
import HowItWorks from "@/components/home/HowItWorks";
import Team from "@/components/home/Team";
import Reviews from "@/components/home/Reviews";
import Branches from "@/components/home/Branches";
import Cta from "@/components/home/Cta";
import { createClient } from "@/lib/supabase/server";
import { getHomeOverview } from "@/lib/supabase/queries/homeOverview";
import { openNow } from "@/lib/ai/spaKnowledge";
import { shortHours } from "@/lib/homeSummary";

export const dynamic = "force-dynamic";

export default async function Home() {
  const overview = await getHomeOverview(await createClient());
  const now = new Date();
  const hero = {
    branches: overview.branches.map((b) => ({ name: b.name, hours: shortHours(b.hours), open: openNow(b.hours, now) })),
    treatments: overview.treatments,
    specialists: overview.specialists,
    rating: overview.reviews.count > 0 ? overview.reviews.average : null,
    reviews: overview.reviews.count,
    categories: overview.departments
      .flatMap((d) => d.categories)
      .sort((a, b) => b.count - a.count)
      .map((c) => c.name),
  };

  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero facts={hero} />
        <Promotions />
        <Services departments={overview.departments} />
        <HowItWorks />
        <Team />
        <Reviews />
        <Branches />
        <Cta overview={overview} />
      </main>
      <Footer />
    </>
  );
}
