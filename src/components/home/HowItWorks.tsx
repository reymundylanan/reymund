import { CalendarClock, CreditCard, MapPin, Sparkles } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";

const STEPS = [
  { icon: Sparkles, title: "Pick a treatment", text: "Browse the menu with prices, durations and real client reviews." },
  { icon: MapPin, title: "Choose branch & specialist", text: "Book at the branch near you, with a specialist you like — or any available." },
  { icon: CalendarClock, title: "Choose your time", text: "Only open time slots are shown — no back-and-forth messages." },
  { icon: CreditCard, title: "Pay your way", text: "Pay ahead with GCash, or at the branch on the day of your visit." },
];

/** Home → how booking works, in four short steps. */
export default function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-20">
      <SectionHeading eyebrow="Easy Booking" title="How It Works" subtitle="From choosing a treatment to walking in, in four simple steps." />
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="relative rounded-3xl border border-nude/70 bg-white p-6 shadow-sm">
            <span className="absolute right-5 top-4 font-display text-4xl font-semibold text-champagne/70" aria-hidden>
              {i + 1}
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-skin text-coral-dark">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 font-semibold text-ink">
              <span className="sr-only">Step {i + 1}: </span>
              {title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/70">{text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
