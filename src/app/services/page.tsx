import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ServicesHero from "@/components/services/ServicesHero";
import ServiceCatalog, { type DbService } from "@/components/services/ServiceCatalog";
import ConsultCta from "@/components/services/ConsultCta";
import { createAdminClient } from "@/lib/supabase/admin";

async function fetchServices(): Promise<DbService[]> {
  const supabase = createAdminClient();

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

  return (
    <>
      <Header />
      <main className="flex-1">
        <ServicesHero />
        <ServiceCatalog services={services} />
        <ConsultCta />
      </main>
      <Footer />
    </>
  );
}
