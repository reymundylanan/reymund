import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ServicesHero from "@/components/services/ServicesHero";
import ServiceCatalog, { type DbService } from "@/components/services/ServiceCatalog";
import MottoBanner from "@/components/services/MottoBanner";
import { createClient } from "@/lib/supabase/server";
import { getServiceReviewSummaries } from "@/lib/supabase/queries/serviceReviews";

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
  const ratings = await getServiceReviewSummaries(await createClient(), services.map((s) => ({ id: s.id, name: s.name })));

  return (
    <>
      <Header />
      <main className="flex-1">
        <ServicesHero />
        <ServiceCatalog services={services} ratings={ratings} />
        <MottoBanner />
      </main>
      <Footer />
    </>
  );
}
