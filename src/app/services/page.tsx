import { createClient } from "@supabase/supabase-js";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ServicesHero from "@/components/services/ServicesHero";
import ServiceCatalog, { type DbService } from "@/components/services/ServiceCatalog";
import ConsultCta from "@/components/services/ConsultCta";

async function fetchServices(): Promise<DbService[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const { data } = await supabase
    .from("branch_services")
    .select("id, name, category, department, duration, price, price_41, description, image_url")
    .eq("status", "Active")
    .order("category")
    .order("name");

  const seen = new Set<string>();
  return ((data ?? []) as DbService[]).filter((s) => {
    const key = `${s.name}||${s.category}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
