"use client";

import Image from "next/image";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import type { StaffStatus } from "@/lib/multiBranch/engine";

/** Status colours (inside `.status-colors`, so they're the real hues):
 * green available · blue assigned / in service · purple break · amber pending
 * or needs review · red unavailable. */
export const STAFF_STATUS: Record<StaffStatus, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "green" },
  scheduled: { label: "Scheduled", tone: "green" },
  partial_off: { label: "Half day off", tone: "amber" },
  in_service: { label: "In service", tone: "blue" },
  on_break: { label: "On break", tone: "purple" },
  out: { label: "Out", tone: "red" },
  day_off: { label: "Day off", tone: "red" },
  lent_out: { label: "Lent out", tone: "amber" },
};

export type Tone = "green" | "blue" | "purple" | "amber" | "red" | "gray";

export const TONE: Record<Tone, { badge: string; ring: string; dot: string; soft: string }> = {
  green: { badge: "bg-green-100 text-green-700", ring: "border-green-400", dot: "bg-green-500", soft: "bg-green-50" },
  blue: { badge: "bg-blue-100 text-blue-700", ring: "border-blue-400", dot: "bg-blue-500", soft: "bg-blue-50" },
  purple: { badge: "bg-purple-100 text-purple-700", ring: "border-purple-400", dot: "bg-purple-500", soft: "bg-purple-50" },
  amber: { badge: "bg-amber-100 text-amber-700", ring: "border-amber-400", dot: "bg-amber-500", soft: "bg-amber-50" },
  red: { badge: "bg-red-100 text-red-700", ring: "border-red-400", dot: "bg-red-500", soft: "bg-red-50" },
  gray: { badge: "bg-ink/5 text-ink/60", ring: "border-ink/15", dot: "bg-ink/30", soft: "bg-ink/[0.03]" },
};

export function Badge({ tone, children, className = "" }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[tone].badge} ${className}`}>
      {children}
    </span>
  );
}

export function Avatar({ name, url, size = 36 }: { name: string; url: string | null; size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-champagne text-sm font-semibold text-coral-dark"
      style={{ width: size, height: size }}
    >
      {url ? <Image src={url} alt="" fill sizes={`${size}px`} className="object-cover" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

/** One line of a validation checklist. */
export function CheckRow({ ok, label, detail, na }: { ok: boolean; label: string; detail?: string; na?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
          na ? "bg-ink/5 text-ink/40" : ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}
      >
        {na ? <span className="text-[10px] font-bold">–</span> : ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className={`font-medium ${na ? "text-ink/45" : ok ? "text-ink" : "text-red-700"}`}>{label}</span>
        {detail && <span className="block text-xs text-ink/55">{detail}</span>}
      </span>
    </li>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-hidden />;
}

/** POST JSON to an Admin API; throws the server's readable message. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(json.error ?? "Something went wrong."), { data: json, status: res.status });
  return json;
}
