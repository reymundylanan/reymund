"use client";

import { useState } from "react";
import ClientList from "@/components/frontdesk/clients/ClientList";
import ClientProfile from "@/components/frontdesk/clients/ClientProfile";
import { clients } from "@/lib/frontdeskData";

export default function ClientsManager() {
  const [selected, setSelected] = useState(clients[0]);
  const [query, setQuery] = useState("");

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <ClientList
        selectedId={selected.id}
        onSelect={setSelected}
        query={query}
        onQueryChange={setQuery}
      />
      <ClientProfile client={selected} />
    </div>
  );
}
