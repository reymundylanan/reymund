import type { ComponentType, ReactNode } from "react";

/** Card shell shared by the Notifications page. */
export const CARD =
  "rounded-[24px] bg-white p-6 sm:p-7 ring-1 ring-[#ebdfc3] shadow-[0_18px_40px_-34px_rgba(70,48,18,0.55)]";

/** Icon tile + title + one-line description, with an optional control on the right. */
export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  badge,
  right,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e4d2a8] bg-[#fffaf0] text-coral-dark">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-xl font-normal leading-tight tracking-[-0.01em] text-ink">
            {title} {badge}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink/55">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/** Rounded on/off switch. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-coral" : "bg-ink/15"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[1.375rem]" : "left-0.5"}`} />
    </button>
  );
}

export const FIELD =
  "mt-1.5 w-full rounded-xl border border-[#e8dcc0] bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink/35 focus:border-coral focus:ring-2 focus:ring-coral/15";
export const LABEL = "block text-sm font-medium text-ink/75";
