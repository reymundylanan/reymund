"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

export type StatTone = "default" | "dark" | "good" | "warn" | "alert";

const ICON_TONE: Record<StatTone, string> = {
  default: "bg-[#f8efd9] text-coral-dark",
  dark: "bg-ink text-white",
  good: "bg-green-50 text-green-700",
  warn: "bg-amber-50 text-amber-700",
  alert: "bg-red-50 text-red-600",
};

/**
 * One summary box for every admin / front-desk page: icon + label, a big
 * number, and a short note. Clickable when it opens or filters something;
 * `active` outlines the one that's currently applied.
 */
export default function StatCard({
  icon: Icon,
  label,
  value,
  note,
  tone = "default",
  active = false,
  onClick,
  href,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: StatTone;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  title?: string;
}) {
  const body = (
    <>
      <span className="flex w-full items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${active ? "bg-coral text-white" : ICON_TONE[tone]}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{label}</span>
      </span>
      <span className="mt-3 block text-3xl font-semibold tabular-nums leading-none text-ink">{value ?? "—"}</span>
      {note != null && note !== "" && <span className="mt-1.5 block w-full truncate text-xs font-medium text-ink/60">{note}</span>}
    </>
  );
  const shell = `flex min-w-0 flex-col items-start rounded-2xl bg-white p-4 text-left shadow-[0_10px_30px_-24px_rgba(90,60,20,0.5)] ring-1 transition ${
    active ? "ring-2 ring-coral" : "ring-[#efe3c6]"
  }`;
  const interactive = `${shell} hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-20px_rgba(90,60,20,0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral`;

  if (href) {
    return (
      <Link href={href} className={interactive} title={title}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={interactive} title={title}>
        {body}
      </button>
    );
  }
  return (
    <div className={shell} title={title}>
      {body}
    </div>
  );
}
