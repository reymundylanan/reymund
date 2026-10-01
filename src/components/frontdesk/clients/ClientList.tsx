"use client";

import { useState } from "react";
import Image from "next/image";
import { BadgeCheck, Search, Star, TrendingUp } from "lucide-react";
import type { FrontDeskClient } from "@/lib/supabase/queries/frontdeskClients";
import { HIGH_SPEND_MIN, filterClients } from "@/lib/clientDirectory";

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

export default function ClientList({
  clients,
  loading,
  selectedId,
  onSelect,
  query,
  onQueryChange,
}: {
  clients: FrontDeskClient[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (c: FrontDeskClient) => void;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const [vipOnly, setVipOnly] = useState(false);
  const [highSpend, setHighSpend] = useState(false);
  const filtered = filterClients(clients, { query, vipOnly, highSpend });
  const vipCount = clients.filter((c) => c.vip).length;
  const highSpendCount = clients.filter((c) => c.totalSpend >= HIGH_SPEND_MIN).length;
  const filtering = vipOnly || highSpend || query.trim() !== "";

  const chip = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium transition ${
      active ? "border-coral bg-coral text-white" : "border-ink/15 text-ink/60 hover:border-coral"
    }`;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Client Directory</h2>

      <div className="mt-4 flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50">
        <Search className="h-4 w-4" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name or phone..."
          aria-label="Search clients by name or phone"
          className="w-full text-sm outline-none placeholder:text-ink/40"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button type="button" aria-pressed={vipOnly} onClick={() => setVipOnly((v) => !v)} className={chip(vipOnly)}>
          <Star className="h-3.5 w-3.5" /> VIP Only ({vipCount})
        </button>
        <button
          type="button"
          aria-pressed={highSpend}
          onClick={() => setHighSpend((v) => !v)}
          title={`Clients who have spent ${peso(HIGH_SPEND_MIN)} or more, biggest spenders first`}
          className={chip(highSpend)}
        >
          <TrendingUp className="h-3.5 w-3.5" /> High Spend ({highSpendCount})
        </button>
      </div>
      {highSpend && <p className="mt-2 text-[11px] text-ink/40">Spent {peso(HIGH_SPEND_MIN)} or more · biggest first</p>}

      <div className="mt-4 space-y-1">
        {loading && <p className="py-6 text-center text-sm text-ink/40">Loading clients…</p>}
        {!loading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-ink/40">
            {filtering ? "No clients match these filters." : "No clients found."}
          </p>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${
              selectedId === c.id ? "bg-blush" : "hover:bg-blush/50"
            }`}
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-coral/15 text-sm font-semibold text-coral-dark">
              {c.avatarUrl ? <Image src={c.avatarUrl} alt="" fill sizes="36px" className="object-cover" /> : c.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
              {(highSpend || c.phone) && (
                <span className="block truncate text-xs text-ink/45">{highSpend ? `${peso(c.totalSpend)} spent` : c.phone}</span>
              )}
            </span>
            {c.vip && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-gold/30 px-2 py-0.5 text-[11px] font-semibold text-coral-dark">
                <BadgeCheck className="h-3 w-3" /> VIP
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
