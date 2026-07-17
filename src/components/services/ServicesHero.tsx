import Image from "next/image";

export default function ServicesHero() {
  return (
    <section className="relative flex min-h-[28rem] items-center overflow-hidden px-6 py-24 text-center text-white">
      <Image
        src="/images/services/services.png"
        alt=""
        fill
        priority
        className="object-cover object-[center_30%]"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#1f2a20]/65 via-[#2c3a2a]/55 to-[#3a2a22]/50" />

      <div className="relative mx-auto max-w-2xl">
        <h1 className="text-4xl font-semibold">Indulge in Absolute Serenity</h1>
        <p className="mt-4 text-white/80">
          Rejuvenate your mind, body, and soul with our curated selection of
          luxury spa treatments. From ancient healing techniques to modern
          skin science.
        </p>
      </div>
    </section>
  );
}
