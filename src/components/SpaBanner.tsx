import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

/** Good morning / afternoon / evening, by Philippine time. */
export function spaGreeting(now = new Date()): string {
  const h = Number(now.toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hour12: false })) % 24;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export type BannerLink = { href: string; label: string; icon: ComponentType<{ className?: string }>; primary?: boolean };

/**
 * The spa photo banner at the top of the Admin and Front Desk dashboards:
 * greeting, a line about today, optional fact chips, and shortcut buttons.
 * No hooks, so it works in server and client components.
 */
export default function SpaBanner({
  eyebrow,
  title,
  subtitle,
  facts = [],
  links,
  aside,
  image = "/images/about/about1.jpg",
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  facts?: string[];
  links: BannerLink[];
  aside?: ReactNode;
  image?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-[28px] text-white shadow-[0_24px_50px_-30px_rgba(60,35,15,0.7)]">
      <Image src={image} alt="" fill priority sizes="(max-width: 1024px) 100vw, 80vw" className="-z-20 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#2b1a10]/90 via-[#4a3020]/70 to-[#a8843a]/25" />

      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-champagne">{eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
          <p className="mt-1.5 text-sm text-white/80">{subtitle}</p>
          {facts.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {facts.map((f) => (
                <li key={f} className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          {aside}
          <div className="flex flex-wrap gap-2">
            {links.map(({ href, label, icon: I, primary }) => (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${
                  primary ? "bg-coral text-white hover:bg-coral-dark" : "bg-white/95 text-ink hover:bg-champagne"
                }`}
              >
                <I className={`h-4 w-4 ${primary ? "text-white" : "text-coral-dark"}`} /> {label}
                <ArrowRight className={`h-3.5 w-3.5 transition group-hover:translate-x-0.5 ${primary ? "text-white/70" : "text-ink/40"}`} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
