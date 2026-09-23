import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function GlowJourneyPage() {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-blush/30 px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold text-ink">Your Glow Journey</h1>
        <p className="max-w-md text-ink/60">
          We&apos;re building a way for you to track your wellness milestones.
          Coming soon!
        </p>
        <Link
          href="/my-glow"
          className="rounded-full bg-coral px-6 py-2.5 font-semibold text-white hover:bg-coral-dark"
        >
          Back to My Glow
        </Link>
      </main>
      <Footer />
    </>
  );
}
