import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/components/home/Hero";
import Promotions from "@/components/home/Promotions";
import Services from "@/components/home/Services";
import Team from "@/components/home/Team";
import Reviews from "@/components/home/Reviews";
import Branches from "@/components/home/Branches";
import Cta from "@/components/home/Cta";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <Hero />
        <Promotions />
        <Services />
        <Team />
        <Reviews />
        <Branches />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
