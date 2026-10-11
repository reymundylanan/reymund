import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import type { DepartmentSummary } from "@/lib/homeSummary";

const categories = [
  {
    id: "Hair",
    name: "Hair Care",
    badge: "Hair",
    description: "From classic cuts to premium treatments — our hair specialists bring out the best in your hair.",
    image: "/images/hero/hair.jpg",
    alt: "Stylist finishing a client's hair",
    imgClass: "object-cover object-top",
  },
  {
    id: "Clinic",
    name: "Clinic & Spa",
    badge: "Clinic",
    description: "Facials, laser, slimming, drips and doctor's procedures in a calm, private setting.",
    image: "/images/hero/clinic.jpeg",
    alt: "Treatment room at the Blush clinic",
    imgClass: "object-cover object-top",
  },
  {
    id: "Nails",
    name: "Nail Care",
    badge: "Nails",
    description: "Manicure, pedicure, and nail art services designed to keep your hands and feet looking flawless.",
    image: "/images/hero/nail.jpg",
    alt: "Freshly done manicure",
    imgClass: "object-cover object-center scale-105",
  },
];

const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;

export default function Services({ departments }: { departments: DepartmentSummary[] }) {
  return (
    <section id="services" className="bg-blush py-20">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          eyebrow="Blush Excellence"
          title="Our Signature Services"
          subtitle="Expertly curated treatments designed to restore balance to your body and mind."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => {
            const facts = departments.find((d) => d.department === cat.id);
            const first = facts?.categories[0]?.name;
            return (
              <div
                key={cat.id}
                className="flex flex-col overflow-hidden rounded-3xl border border-nude/70 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#a8843a]/15"
              >
                <div className="relative h-56 overflow-hidden">
                  <Image src={cat.image} alt={cat.alt} fill className={cat.imgClass} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium text-white">{cat.badge}</span>
                  {facts && (
                    <span className="absolute bottom-3 right-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-ink shadow-sm">
                      {facts.treatments} treatment{facts.treatments === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-lg font-semibold text-ink">{cat.name}</h3>
                    {facts?.fromPrice != null && (
                      <p className="shrink-0 text-sm text-ink/65">
                        from <span className="font-semibold text-coral-dark">{peso(facts.fromPrice)}</span>
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-ink/70">{cat.description}</p>

                  {facts && facts.categories.length <= 1 && facts.examples.length > 0 && (
                    <ul className="space-y-1.5 text-sm text-ink/75" aria-label={`Popular ${cat.name.toLowerCase()} treatments`}>
                      {facts.examples.map((name) => (
                        <li key={name} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-champagne" aria-hidden />
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}

                  {facts && facts.categories.length > 1 && (
                    <ul className="flex flex-wrap gap-1.5" aria-label={`${cat.name} categories`}>
                      {facts.categories.map((c) => (
                        <li key={c.name}>
                          <Link
                            href={`/services?category=${encodeURIComponent(c.name)}`}
                            className="inline-block rounded-full border border-nude bg-cream px-2.5 py-1 text-xs text-ink/75 transition hover:border-coral hover:text-coral-dark"
                          >
                            {c.name} <span className="text-ink/45">· {c.count}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}

                  <Link
                    href={first ? `/services?category=${encodeURIComponent(first)}` : "/services"}
                    className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-coral-dark hover:underline"
                  >
                    See {cat.name.toLowerCase()} <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link href="/services" className="inline-block rounded-full bg-coral px-6 py-3 text-sm font-semibold text-white hover:bg-coral-dark">
            Browse Full Catalog →
          </Link>
        </div>
      </div>
    </section>
  );
}
