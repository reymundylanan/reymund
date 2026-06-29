import Image from "next/image";

export default function BranchesHero() {
  return (
    <section className="relative flex min-h-[28rem] items-end overflow-hidden px-6 py-10 text-white">
      <Image
        src="/images/branches/branches1.jpg"
        alt=""
        fill
        priority
        className="object-cover object-[center_20%]"
      />
      <div className="absolute inset-0 bg-black/35" />

      <div className="relative w-full max-w-7xl">
        <h1 className="max-w-xl text-4xl font-semibold sm:text-5xl">
          Find Your <span className="italic text-rose">Oasis</span> Near You
        </h1>
        <p className="mt-4 max-w-lg text-white/80">
          Step away from the city bustle. Discover our thoughtfully designed
          spa locations, each offering a unique sanctuary for your
          well-being.
        </p>
      </div>
    </section>
  );
}
