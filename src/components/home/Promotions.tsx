import { promotions } from "@/lib/data";

export default function Promotions() {
  return (
    <section id="promotions" className="mx-auto max-w-7xl px-6 py-20">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-semibold text-ink">Active Promotions</h2>
        <p className="mt-2 text-ink/60">
          Exclusive deals for our synchronized members
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {promotions.map((promo) => (
          <div
            key={promo.id}
            className="relative h-44 overflow-hidden rounded-2xl bg-gradient-to-br from-rose via-coral to-coral-dark p-5 text-white"
          >
            <span className="inline-block rounded-full bg-white/25 px-3 py-1 text-xs font-medium backdrop-blur">
              Special Offer
            </span>
            <h3 className="mt-12 text-xl font-semibold">{promo.title}</h3>
            <span className="mt-1 inline-block text-2xl font-bold text-gold">
              {promo.badge}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
