import type { ReactNode } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const SPA_EMAIL = "blushspaxaesthetics@gmail.com";
export const SPA_PHONE = "+63 970 081 0473";

/** Shared layout for FAQs, Privacy, Terms, Data Deletion and Feedback. */
export default function InfoPage({ eyebrow, title, intro, updated, children }: { eyebrow: string; title: string; intro?: string; updated?: string; children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1 bg-cream">
        <section className="border-b border-nude/70 bg-gradient-to-br from-skin via-cream to-champagne/40 px-6 py-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-coral-dark">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold text-ink sm:text-5xl">{title}</h1>
          {intro && <p className="mx-auto mt-4 max-w-2xl text-ink/70">{intro}</p>}
          {updated && <p className="mt-3 text-xs text-ink/50">Last updated: {updated}</p>}
        </section>
        <div className="mx-auto max-w-3xl px-6 py-12">{children}</div>
      </main>
      <Footer />
    </>
  );
}

/** A titled block of text inside an info page. */
export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8 rounded-3xl border border-nude/70 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink/75 [&_a]:font-medium [&_a]:text-coral-dark [&_a]:underline [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </section>
  );
}
