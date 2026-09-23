"use client";

import { useEffect, useState } from "react";
import ClientList from "@/components/frontdesk/clients/ClientList";
import ClientProfile from "@/components/frontdesk/clients/ClientProfile";
import { createClient } from "@/lib/supabase/client";
import { getClients, type FrontDeskClient } from "@/lib/supabase/queries/frontdeskClients";

export default function ClientsManager() {
  const [clients, setClients] = useState<FrontDeskClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const supabase = createClient();
    getClients(supabase).then((list) => {
      setClients(list);
      setSelectedId(list[0]?.id ?? null);
      setLoading(false);
    });
  }, []);

  const selected = clients.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <ClientList
        clients={clients}
        loading={loading}
        selectedId={selectedId}
        onSelect={(c) => setSelectedId(c.id)}
        query={query}
        onQueryChange={setQuery}
      />
      {selected ? (
        <ClientProfile
          client={selected}
          onVipChange={(isVip) =>
            setClients((prev) =>
              prev.map((c) => (c.id === selected.id ? { ...c, vip: isVip } : c))
            )
          }
        />
      ) : (
        <div className="flex items-center justify-center rounded-2xl bg-white p-6 text-sm text-ink/40 shadow-sm">
          {loading ? "Loading clients…" : "No clients found."}
        </div>
      )}
    </div>
  );
}
