import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ServicesHero from "@/components/services/ServicesHero";
import ServiceCatalog from "@/components/services/ServiceCatalog";
import ConsultCta from "@/components/services/ConsultCta";

export default function ServicesPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <ServicesHero />
        <ServiceCatalog />
        <ConsultCta />
      </main>
      <Footer />
    </>
  );
}
