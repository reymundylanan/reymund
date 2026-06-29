const stats = [
  { value: "2+", label: "Prime Branches" },
  { value: "50+", label: "Staff Professionals" },
  { value: "10k+", label: "Happy Clients" },
];

export default function Leadership() {
  return (
    <section className="bg-blush px-6 py-20">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div className="relative h-[420px] overflow-hidden rounded-3xl bg-gradient-to-br from-coral to-ink/40">
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-5 text-white">
            <p className="font-semibold">Ms. Liberose T. Amir,</p>
            <p className="text-sm text-white/80">
              Human Resources &amp; Visionary Client
            </p>
          </div>
        </div>

        <div>
          <span className="inline-block rounded-full border border-coral/40 px-4 py-1.5 text-xs font-semibold text-coral-dark">
            Corporate Leadership
          </span>
          <h2 className="mt-4 text-3xl font-semibold text-ink">
            Driving Excellence Through{" "}
            <span className="text-coral">People-First</span> Management.
          </h2>

          <p className="mt-4 text-ink/70">
            Under the stewardship of Ms. Liberose T. Amir, Blush Spa &amp;
            Aesthetics has grown from a local vision to a regional benchmark
            for aesthetic excellence. Her commitment to efficient service
            management ensures that every client interaction is seamless and
            rewarding.
          </p>
          <p className="mt-4 text-ink/70">
            Our mission is simple yet profound: to empower our clients by
            enhancing their natural beauty through science-backed aesthetic
            treatments and therapeutic spa experiences, all while maintaining
            the highest standards of professional ethics.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-6 border-t border-ink/10 pt-6">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-semibold text-coral-dark">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs font-medium uppercase text-ink/50">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
