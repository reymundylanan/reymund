import Image from "next/image";
import Link from "next/link";

const categories = [
  {
    id: "hair",
    name: "Hair Care",
    badge: "Hair",
    description: "From classic cuts to premium treatments — our hair specialists bring out the best in your hair.",
    image: "/images/hero/hair.jpg",
    href: "/services",
    imgClass: "object-cover object-top",
  },
  {
    id: "clinic",
    name: "Clinic & Spa",
    badge: "Clinic",
    description: "Advanced skin and body treatments delivered by certified professionals in a relaxing environment.",
    image: "/images/hero/clinic.jpeg",
    href: "/services",
    imgClass: "object-cover object-top",
  },
  {
    id: "nails",
    name: "Nail Care",
    badge: "Nails",
    description: "Manicure, pedicure, and nail art services designed to keep your hands and feet looking flawless.",
    image: "/images/hero/nail.jpg",
    href: "/services",
    imgClass: "object-cover object-center scale-105",
  },
];

export default function Services() {
  return (
    <section id="services" className="bg-blush py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 text-center">
          <span className="inline-block rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-coral-dark shadow-sm">
            Blush Excellence
          </span>
          <h2 className="mt-4 text-3xl font-semibold text-ink">
            Our Signature Services
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-ink/60">
            Expertly curated treatments designed to restore balance to your
            body and mind.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <div key={cat.id} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="relative h-56 overflow-hidden">
                <Image
                  src={cat.image}
                  alt={cat.name}
                  fill
                  className={cat.imgClass}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white">
                  {cat.badge}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <h3 className="text-lg font-semibold text-ink">{cat.name}</h3>
                <p className="text-sm text-ink/60">{cat.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/services"
            className="inline-block rounded-full bg-coral px-6 py-3 text-sm font-semibold text-white hover:bg-coral-dark"
          >
            Browse Full Catalog →
          </Link>
        </div>
      </div>
    </section>
  );
}
