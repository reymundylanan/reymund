import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AboutHero from "@/components/about/AboutHero";
import Leadership from "@/components/about/Leadership";
import Locations from "@/components/about/Locations";
import Commitment from "@/components/about/Commitment";
import Testimonials from "@/components/about/Testimonials";
import JoinTeamCta from "@/components/about/JoinTeamCta";

export const metadata = {
  title: "About Us",
  description: "Meet Blush Spa & Aesthetics — our story, our team of specialists and our two branches in Pagadian City: One Cecilia Center and Robinsons Pagadian.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <AboutHero />
        <Leadership />
        <Locations />
        <Commitment />
        <Testimonials />
        <JoinTeamCta />
      </main>
      <Footer />
    </>
  );
}
