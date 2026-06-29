const stats = [
  { value: "4.9/5", label: "Google Rating" },
  { value: "100%", label: "GCash Verified" },
  { value: "2", label: "Luxury Branches" },
];

export default function Cta() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div className="rounded-3xl bg-gradient-to-br from-[#3a2a22] via-[#2c2018] to-[#1f1610] px-8 py-16 text-center text-white">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold sm:text-4xl">
          Ready to Synchronize Your Senses and Reclaim Your Glow?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/70">
          Join 15,000+ happy clients who have found their sanctuary at
          GlowSync. New members get a complimentary head massage on their
          first booking.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <button className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-ink hover:brightness-95">
            Schedule Now
          </button>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-12">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-sm text-white/60">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
