"use client";

import { BadgeCheck, Plus, Search, User } from "lucide-react";
import { clients, type Client } from "@/lib/frontdeskData";

export default function ClientList({
  selectedId,
  onSelect,
  query,
  onQueryChange,
}: {
  selectedId: string;
  onSelect: (c: Client) => void;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Client Directory</h2>
        <button className="flex items-center gap-1.5 rounded-full bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral-dark">
          <Plus className="h-3.5 w-3.5" /> New Client
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50">
        <Search className="h-4 w-4" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full text-sm outline-none placeholder:text-ink/40"
        />
      </div>

      <div className="mt-3 flex gap-2 text-xs">
        <button className="rounded-full border border-ink/15 px-3 py-1.5 font-medium text-ink/60">
          VIP Only
        </button>
        <button className="rounded-full border border-ink/15 px-3 py-1.5 font-medium text-ink/60">
          High Spend
        </button>
      </div>

      <div className="mt-4 space-y-1">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${
              selectedId === c.id ? "bg-blush" : "hover:bg-blush/50"
            }`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-coral/15 text-ink/50">
              <User className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-ink">{c.name}</span>
            </span>
            {c.vip && (
              <span className="flex items-center gap-1 rounded-full bg-gold/30 px-2 py-0.5 text-[11px] font-semibold text-coral-dark">
                <BadgeCheck className="h-3 w-3" /> VIP
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
