import Image from "next/image";

export default function AdminTopbar() {
  return (
    <header className="flex items-center justify-between border-b border-ink/10 bg-white px-6 py-5">
      <div className="flex items-center gap-2">
        <Image
          src="/images/logo/blushnewlogo.jpeg"
          alt="Blush Spa & Aesthetics"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 object-contain"
        />
        <span className="whitespace-nowrap text-lg font-semibold text-coral-dark">
          Blush Spa &amp; Aesthetics
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blush text-base font-semibold text-coral-dark">
          A
        </span>
        <div>
          <p className="text-base font-medium text-ink">Admin User</p>
          <p className="text-sm text-ink/50">Super Administrator</p>
        </div>
      </div>
    </header>
  );
}
