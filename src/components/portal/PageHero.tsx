import type { ComponentType, ReactNode } from "react";

/** A small white pill for numbers in a PageHero (e.g. "★ 4.8 · 120 reviews"). */
export const HERO_CHIP = "flex items-center gap-1.5 rounded-full bg-white/80 px-3.5 py-2 text-sm ring-1 ring-[#efe3c6] backdrop-blur";

/** The gold header card every Admin / Front Desk page opens with: a soft
 * glow, a gold icon badge, a small eyebrow, the page title and one line of
 * description. `actions` sit on the right; `children` go under the title row
 * inside the same card (filters, search, tabs). */
export default function PageHero({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative isolate rounded-3xl border border-[#efe3c6] bg-gradient-to-br from-white via-[#fffaf0] to-[#f7ecd2] p-6 shadow-[0_24px_48px_-36px_rgba(70,48,18,0.45)] sm:p-7 ${className}`}
    >
      {/* The glow is clipped on its own layer, so menus opened from the
          header can still drop below the card. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <span className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(201,164,74,0.28),transparent_65%)]" />
      </span>

      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#e9c868] to-coral-dark text-white shadow-[0_12px_24px_-12px_rgba(168,137,48,0.8)]">
            <Icon className="h-7 w-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-coral-dark">{eyebrow}</p>
            <h1 className="text-2xl font-semibold leading-tight text-ink sm:text-3xl">{title}</h1>
            {subtitle && <div className="mt-0.5 text-sm text-ink/55">{subtitle}</div>}
          </div>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>

      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}
