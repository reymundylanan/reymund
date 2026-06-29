import Image from "next/image";

export default function AboutHero() {
  return (
    <section className="relative overflow-hidden px-6 py-20">
      <Image
        src="/images/about/about1.jpg"
        alt=""
        fill
        priority
        className="object-cover object-[center_30%]"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#c9a89a]/30 via-[#d9bdae]/25 to-[#e7d2c4]/20" />

      <div className="relative mx-auto max-w-3xl">
        <span className="inline-block rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold text-ink/70">
          Est. In Pagadian City
        </span>
        <h1 className="mt-4 text-5xl font-semibold text-ink">
          Elegance
          <br />
          <span className="italic text-coral">Redefined.</span>
        </h1>
        <p className="mt-4 max-w-lg text-ink/70">
          Blush Spa &amp; Aesthetics is dedicated to providing world-class
          professional spa and aesthetic services, crafted with precision
          and delivered with a heart for quality care.
        </p>
        <button className="mt-6 rounded-full bg-coral px-6 py-3 text-sm font-semibold text-white hover:bg-coral-dark">
          Explore Services
        </button>
      </div>
    </section>
  );
}
