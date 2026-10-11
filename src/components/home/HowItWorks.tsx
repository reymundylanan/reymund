import SectionHeading from "@/components/SectionHeading";
import HowItWorksSteps from "@/components/home/HowItWorksSteps";

/** Home → how booking works, in four short steps; GlowSync AI explains each one. */
export default function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-20">
      <SectionHeading
        eyebrow="Easy Booking"
        title="How It Works"
        subtitle="From choosing a treatment to walking in, in four simple steps. Point at (or tap) a step and GlowSync AI will walk you through it."
      />
      <HowItWorksSteps />
    </section>
  );
}
