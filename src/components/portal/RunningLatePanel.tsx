"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowRightLeft, BellRing, Check, Hourglass, Loader2 } from "lucide-react";
import { clock, type DelayedVisit, type RunningLate } from "@/lib/runningLate";

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Therapists whose service is running past its time, and how late that makes
 * their next clients. For each: tell the client (bell, email, push), open the
 * booking to give it to someone else or move it (Front Desk), or move it to a
 * free therapist (Admin). Shown only while someone is running late.
 */
export default function RunningLatePanel({
  items,
  openHref,
  onMove,
  showBranch,
}: {
  items: RunningLate[];
  /** Front Desk: the booking's page (reassign or reschedule there). */
  openHref?: (d: DelayedVisit) => string;
  /** Admin: the move tool, which picks a free qualified therapist. */
  onMove?: (d: DelayedVisit) => void;
  /** Admin, all branches: which branch each therapist is at. */
  showBranch?: (staffId: string) => string | null;
}) {
  const [sent, setSent] = useState<Record<string, "sending" | "sent" | string>>({});
  if (items.length === 0) return null;

  async function tell(d: DelayedVisit) {
    setSent((s) => ({ ...s, [d.id]: "sending" }));
    const res = await fetch("/api/frontdesk/running-late/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId: d.id, delay: d.delay }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : { error: "Network error — please try again." };
    setSent((s) => ({ ...s, [d.id]: res?.ok ? "sent" : (json.error ?? "Couldn't send. Please try again.") }));
  }

  return (
    <section aria-label="Running late" className="rounded-2xl border border-[#f0c9a6] bg-[#fff7ef] p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[#94602F]">
        <Hourglass className="h-4 w-4" /> Running late
        <span className="font-normal text-ink/55">— services past their time, and who that delays</span>
      </h2>
      <ul className="mt-3 space-y-3">
        {items.map((r) => {
          const where = showBranch?.(r.staffId);
          return (
            <li key={r.current.id} className="rounded-xl bg-white p-3 ring-1 ring-[#f3dcc4]">
              <p className="text-sm text-ink">
                <span className="font-semibold">{r.staffName}</span>
                {where ? <span className="text-ink/50"> · {where}</span> : null} is{" "}
                <span className="font-semibold text-[#b4532a]">{r.current.overBy} min over</span> with {r.current.clientName}
                <span className="text-ink/50"> (planned to end {clock(r.current.plannedEnd)})</span>.
              </p>
              {r.next.length === 0 ? (
                <p className="mt-1 text-xs text-ink/55">No one is waiting on them yet — the gap before their next client covers it.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {r.next.map((d) => {
                    const state = sent[d.id];
                    return (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#fffaf3] px-3 py-2">
                        <span className="text-sm text-ink">
                          <span className="font-semibold">{d.clientName}</span>{" "}
                          <span className="text-ink/60">
                            {clock(d.start)} <ArrowRight className="inline h-3 w-3" /> about {clock(d.expected)}
                          </span>{" "}
                          <span className="rounded-full bg-[#fbe3cf] px-2 py-0.5 text-[11px] font-semibold text-[#94602F]">+{d.delay} min</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {d.clientId ? (
                            state === "sent" ? (
                              <span className="flex items-center gap-1 rounded-full bg-[#E6EDE2] px-3 py-1.5 text-xs font-semibold text-[#4F6B4A]">
                                <Check className="h-3.5 w-3.5" /> {first(d.clientName)} was told
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => tell(d)}
                                disabled={state === "sending"}
                                className="flex items-center gap-1 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark disabled:opacity-60"
                              >
                                {state === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />} Tell {first(d.clientName)}
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-ink/50">No account — call or text them</span>
                          )}
                          {onMove && (
                            <button
                              type="button"
                              onClick={() => onMove(d)}
                              className="flex items-center gap-1 rounded-full border border-coral/50 bg-white px-3 py-1.5 text-xs font-semibold text-coral-dark hover:bg-[#fbf3dc]"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" /> Give to a free therapist
                            </button>
                          )}
                          {openHref && (
                            <Link
                              href={openHref(d)}
                              className="flex items-center gap-1 rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-coral"
                            >
                              Reassign or reschedule
                            </Link>
                          )}
                        </span>
                        {state && state !== "sending" && state !== "sent" && (
                          <p role="alert" className="w-full text-xs text-red-600">
                            {state}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
