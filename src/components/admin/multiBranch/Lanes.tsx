"use client";

import type { ReactNode, Ref } from "react";

/** Soft column colours for the Multi-Branch boards (spa palette). */
export const LANE_TONE = {
  gold: { head: "bg-[#fbf3dc]", dot: "bg-[#C9A44A]" },
  sage: { head: "bg-[#eaf0e5]", dot: "bg-[#8FA98A]" },
  peach: { head: "bg-[#fbebdc]", dot: "bg-[#E0A872]" },
  lilac: { head: "bg-[#efe8f4]", dot: "bg-[#A893C4]" },
  rose: { head: "bg-[#f8e6e6]", dot: "bg-[#C98E92]" },
  sky: { head: "bg-[#e7eff6]", dot: "bg-[#7FA3C4]" },
  gray: { head: "bg-ink/[0.05]", dot: "bg-ink/30" },
} as const;
export type LaneTone = keyof typeof LANE_TONE;

/** Columns side by side; scrolls sideways when there are more than fit. */
export function LaneBoard({ children, scrollerRef }: { children: ReactNode; scrollerRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={scrollerRef} className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 [scrollbar-color:rgba(201,168,74,0.6)_transparent] [scrollbar-width:thin]">
      {children}
    </div>
  );
}

/** One Kanban column: coloured header with a count and a one-line hint. */
export function Lane({
  title,
  hint,
  count,
  tone,
  children,
  laneRef,
  highlight,
  empty = "Nothing here",
}: {
  title: string;
  hint?: string;
  count: number;
  tone: LaneTone;
  children: ReactNode;
  laneRef?: Ref<HTMLElement>;
  highlight?: "ok" | "no" | null;
  empty?: string;
}) {
  return (
    <section
      ref={laneRef}
      aria-label={title}
      className={`flex max-h-[calc(100dvh-15rem)] min-h-56 min-w-[12.5rem] flex-1 basis-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_10px_30px_-24px_rgba(90,60,20,0.5)] ring-1 transition ${
        highlight === "ok" ? "ring-2 ring-[#8FA98A]" : highlight === "no" ? "ring-2 ring-[#C98E92]" : "ring-[#efe3c6]"
      }`}
    >
      <header className={`shrink-0 px-3 py-2.5 ${LANE_TONE[tone].head}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className={`h-2 w-2 rounded-full ${LANE_TONE[tone].dot}`} aria-hidden /> {title}
          </h3>
          <span className="rounded-full bg-white/80 px-2 text-xs font-semibold tabular-nums text-ink/65">{count}</span>
        </div>
        {hint && <p className="mt-0.5 text-[11px] text-ink/55">{hint}</p>}
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-2 [scrollbar-color:rgba(201,168,74,0.5)_transparent] [scrollbar-width:thin]">
        {children}
        {count === 0 && <p className="rounded-xl border-2 border-dashed border-ink/10 py-6 text-center text-xs text-ink/35">{empty}</p>}
      </div>
    </section>
  );
}

/**
 * "Drag here to transfer": one drop zone per branch above a board. While a
 * card is dragged, each zone says whether that branch can take it.
 */
export function BranchDropBar({
  branches,
  dragging,
  over,
  zoneRef,
  keyFor = (id) => id,
  check,
  label = "Drag a card onto a branch to transfer it",
}: {
  branches: { id: string; name: string }[];
  dragging: boolean;
  over: string | null;
  zoneRef: (key: string) => (el: HTMLElement | null) => void;
  keyFor?: (branchId: string) => string;
  /** Can the dragged card go to this branch? Text explains either way. */
  check?: (branchId: string) => { ok: boolean; text: string } | null;
  label?: string;
}) {
  return (
    <div className={`rounded-2xl border-2 border-dashed p-2 transition ${dragging ? "border-coral/60 bg-[#fffaf0]" : "border-[#e6d6ad] bg-white/60"}`}>
      <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-coral-dark">{label}</p>
      <div className="flex flex-wrap gap-2">
        {branches.map((b) => {
          const key = keyFor(b.id);
          const c = dragging && check ? check(b.id) : null;
          const isOver = dragging && over === key;
          return (
            <div
              key={b.id}
              ref={zoneRef(key)}
              className={`min-w-[12rem] flex-1 rounded-xl px-3 py-2.5 text-sm transition ${
                !dragging
                  ? "bg-[#fbf6ea] text-ink/60"
                  : c && !c.ok
                    ? `bg-[#F6E3E3] text-[#9A5257] ${isOver ? "ring-2 ring-[#C98E92]" : ""}`
                    : `bg-[#E6EDE2] text-[#4F6B4A] ${isOver ? "scale-[1.02] ring-2 ring-[#8FA98A]" : ""}`
              }`}
            >
              <p className="font-semibold">{b.name}</p>
              <p className="text-[11px] opacity-80">{dragging ? (c?.text ?? "Drop to transfer here") : "Drop here to transfer"}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A clickable card shell used by every board. */
export function LaneCard({ children, onClick, className = "", dim = false }: { children: ReactNode; onClick?: () => void; className?: string; dim?: boolean }) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      className={`rounded-xl border border-[#f1e4c4] bg-white p-2.5 text-left transition ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-coral/50 hover:shadow-md" : ""} ${
        dim ? "opacity-60" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
