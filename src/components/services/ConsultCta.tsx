export default function ConsultCta() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div className="flex flex-col items-center gap-6 rounded-3xl bg-blush px-8 py-12 text-center">
        <div>
          <h2 className="text-2xl font-semibold text-ink">
            Can&apos;t decide on a treatment?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink/60">
            Our wellness consultants are available to help you choose the
            perfect therapy based on your needs and health goals. Book a
            free 15-minute consultation.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          <button className="rounded-full bg-coral px-6 py-3 text-sm font-semibold text-white hover:bg-coral-dark">
            Consult a Specialist
          </button>
          <button className="rounded-full border border-ink/15 px-6 py-3 text-sm font-semibold text-ink/70 hover:border-coral hover:text-coral-dark">
            Find a Branch
          </button>
        </div>
      </div>
    </section>
  );
}
