import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ServicesHero from "@/components/services/ServicesHero";
import ServiceCatalog, { type DbService } from "@/components/services/ServiceCatalog";
import MottoBanner from "@/components/services/MottoBanner";
import { createClient } from "@/lib/supabase/server";
import { getServicePhotoThumbs, getServiceReviewSummaries } from "@/lib/supabase/queries/serviceReviews";
import { signPublicReviewPhotos } from "@/lib/supabase/reviewPhotoUrls";
import { getActivePromotions } from "@/lib/supabase/queries/publicContent";

async function fetchServices(): Promise<DbService[]> {
  const supabase = await createClient();

  const { data: branchRow, error: branchErr } = await supabase
    .from("branches")
    .select("id")
    .eq("name", "One Cecilia Center")
    .maybeSingle();

  if (branchErr) { console.error("[services] branch error:", branchErr.message); return []; }
  if (!branchRow?.id) { console.error("[services] branch not found"); return []; }

  const { data, error } = await supabase
    .from("branch_services")
    .select("id, name, category, department, duration, price, price_41, description, benefits, hair_options, brows_type, body_wellness_type, facial_options, laser_type, slimming_type, non_surgical_type, doctor_type")
    .eq("branch_id", branchRow.id)
    .eq("status", "Active")
    .order("category")
    .order("name");

  if (error) { console.error("[services] fetch error:", error.message); return []; }
  return (data ?? []) as DbService[];
}

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const services = await fetchServices();
  // Rating + a recent review quote per service (same service name at any branch).
  const supabase = await createClient();
  const [ratings, promos, photos] = await Promise.all([
    getServiceReviewSummaries(supabase, services.map((s) => ({ id: s.id, name: s.name }))),
    // Active promos, so the GlowSync guide can mention them on the right cards.
    getActivePromotions(supabase, 30),
    // Clients' photos from their reviews, shown on each card.
    getServicePhotoThumbs(supabase, signPublicReviewPhotos, services.map((s) => ({ id: s.id, name: s.name }))),
  ]);

  return (
    <>
      <Header />
      <main className="flex-1">
        <ServicesHero />
        <ServiceCatalog
          services={services}
          ratings={ratings}
          photos={photos}
          promos={promos.map((p) => ({ id: p.id, title: p.title, price: p.price, validUntil: p.validUntil, category: p.category }))}
        />
        <MottoBanner />
      </main>
      <Footer />
    </>
  );
}
