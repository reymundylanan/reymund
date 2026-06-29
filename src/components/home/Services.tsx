import ServiceCard from "@/components/ServiceCard";
import { services } from "@/lib/data";

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

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              badge={service.category}
              name={service.name}
              rating={service.rating}
              description={service.description}
              duration={service.duration}
              next={service.next}
              singlePrice={service.singlePrice}
              packPrice={service.packPrice}
            />
          ))}
        </div>

        <div className="mt-10 text-center">
          <a
            href="/services"
            className="inline-block rounded-full bg-coral px-6 py-3 text-sm font-semibold text-white hover:bg-coral-dark"
          >
            Browse Full Catalog →
          </a>
        </div>
      </div>
    </section>
  );
}
