"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Branch = { id: string; name: string };
type Entry = { id: string; status: string };
export type ServiceAvailability = {
  branches: Branch[];
  /** lower-case service name → branch id → that branch's copy of the service */
  byName: Map<string, Map<string, Entry>>;
  reload: () => void;
};

/** Every branch's services in one query, for the "Available at" switches. */
export function useServiceAvailability(): ServiceAvailability {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [byName, setByName] = useState<Map<string, Map<string, Entry>>>(new Map());
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("branch_services").select("id, branch_id, name, status"),
    ]).then(([b, s]) => {
      if (!alive) return;
      setBranches((b.data as Branch[]) ?? []);
      const map = new Map<string, Map<string, Entry>>();
      for (const r of (s.data ?? []) as { id: string; branch_id: string; name: string; status: string | null }[]) {
        const key = r.name.toLowerCase().trim();
        const per = map.get(key) ?? new Map<string, Entry>();
        // Prefer an active copy when a branch has duplicates.
        const cur = per.get(r.branch_id);
        if (!cur || (cur.status !== "Active" && r.status === "Active")) per.set(r.branch_id, { id: r.id, status: r.status ?? "Active" });
        map.set(key, per);
      }
      setByName(map);
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  return { branches, byName, reload };
}

/** "One Cecilia Center" → "One Cecilia", "Robinsons Pagadian" → "Robinsons". */
function shortName(name: string) {
  const words = name.split(" ");
  let out = words[0] ?? name;
  for (let i = 1; i < words.length && out.length < 6; i++) out += " " + words[i];
  return out;
}

async function post(body: unknown) {
  const res = await fetch("/api/admin/multi-branch/service", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Couldn't change it.");
}

/**
 * On / Off per branch for one service, and "+ Add" for branches that don't
 * have it yet (a copy of this one). Existing bookings are never moved or
 * cancelled; every change is recorded in Multi-Branch → Transfer history.
 */
export default function ServiceBranchToggles({
  serviceId,
  serviceName,
  currentBranchId,
  availability,
  onChanged,
}: {
  serviceId: string;
  serviceName: string;
  currentBranchId: string | null;
  availability: ServiceAvailability;
  onChanged: (branchId: string) => void;
}) {
  const per = availability.byName.get(serviceName.toLowerCase().trim()) ?? new Map<string, Entry>();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(branchId: string, body: unknown) {
    setBusy(branchId);
    setError(null);
    try {
      await post(body);
      availability.reload();
      onChanged(branchId);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
    setConfirmOff(null);
  }

  return (
    <div className="min-w-[11rem]">
      <div className="flex flex-wrap gap-1.5">
        {availability.branches.map((b) => {
          const entry = per.get(b.id);
          const on = entry?.status === "Active";
          const short = shortName(b.name);
          const here = b.id === currentBranchId;
          if (busy === b.id) {
            return (
              <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink/50">
                <Loader2 className="h-3 w-3 animate-spin" /> {short}
              </span>
            );
          }
          if (confirmOff === b.id && entry) {
            return (
              <span key={b.id} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                Turn off at {short}?
                <button
                  onClick={() => run(b.id, { action: "toggle", serviceId: entry.id, active: false, reason: "Turned off from Branches & Services" })}
                  aria-label={`Yes, turn off at ${b.name}`}
                  className="rounded-full bg-red-600 p-0.5 text-white"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button onClick={() => setConfirmOff(null)} aria-label="Keep it on" className="rounded-full bg-white p-0.5 text-red-700">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          }
          if (!entry) {
            return (
              <button
                key={b.id}
                onClick={() => run(b.id, { action: "offer", serviceId, branchId: b.id, reason: "Added from Branches & Services" })}
                title={`Offer ${serviceName} at ${b.name} too (a copy of this service)`}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink/25 px-2.5 py-1 text-xs font-semibold text-ink/50 transition hover:border-coral hover:text-coral-dark"
              >
                <Plus className="h-3 w-3" /> {short}
              </button>
            );
          }
          return (
            <button
              key={b.id}
              role="switch"
              aria-checked={on}
              onClick={() =>
                on
                  ? setConfirmOff(b.id)
                  : run(b.id, { action: "toggle", serviceId: entry.id, active: true, reason: "Turned on from Branches & Services" })
              }
              title={`${on ? "Offered" : "Not offered"} at ${b.name}${here ? " (this branch)" : ""} — click to turn ${on ? "off" : "on"}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                on ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-ink/5 text-ink/45 hover:bg-ink/10"
              } ${here ? "ring-1 ring-current/30" : ""}`}
            >
              <span className={`relative h-3.5 w-6 rounded-full transition ${on ? "bg-emerald-500" : "bg-ink/25"}`}>
                <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`} />
              </span>
              {short}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
