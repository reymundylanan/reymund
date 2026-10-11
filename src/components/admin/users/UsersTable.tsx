"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, MapPin, MoreHorizontal, Search, UserPlus } from "lucide-react";
import UserEditPanel from "@/components/admin/users/UserEditPanel";
import ClientViewPanel from "@/components/admin/users/ClientViewPanel";
import CreateUserModal from "@/components/admin/users/CreateUserModal";
import StaffMembersPanel from "@/components/admin/users/StaffMembersPanel";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { ClientUser, StaffUser } from "@/components/admin/users/types";

const tabs = ["Administrators", "Front Desk", "Staff", "Clients"];

const tabRoleMap: Record<string, StaffUser["role"] | null> = {
  Administrators: "admin",
  "Front Desk": "front_desk",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  front_desk: "Front Desk",
};

/** Who's in the system, by role — the four tones of the brand gold, darkest = most access. */
const MIX: { tab: string; label: string; color: string; note: string }[] = [
  { tab: "Administrators", label: "Admins", color: "#2b1a16", note: "Every branch" },
  { tab: "Front Desk", label: "Front desk", color: "#A88930", note: "One branch each" },
  { tab: "Staff", label: "Staff", color: "#C9A84A", note: "Therapists & specialists" },
  { tab: "Clients", label: "Clients", color: "#E3CC8F", note: "Booking accounts" },
];

const ROLE_CHIP: Record<string, string> = {
  admin: "bg-ink text-white",
  front_desk: "bg-[#F3E7C4] text-[#7A5F14]",
};

const joined = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function UsersTable({
  users,
  onRefresh,
}: {
  users: StaffUser[];
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState(tabs[0]);
  const [query, setQuery] = useState("");
  const [activeUser, setActiveUser] = useState<StaffUser | null>(null);
  const [activeClient, setActiveClient] = useState<ClientUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [clients, setClients] = useState<ClientUser[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);

  const [staffCount, setStaffCount] = useState(0);
  const [clientsTotal, setClientsTotal] = useState(0);

  useEffect(() => {
    async function fetchCounts() {
      const supabase = createClient();
      const [{ count: sc }, clientsRes] = await Promise.all([
        supabase.from("staff_members").select("*", { count: "exact", head: true }),
        fetch("/api/admin/clients"),
      ]);
      setStaffCount(sc ?? 0);
      if (clientsRes.ok) {
        const data = await clientsRes.json();
        const list: ClientUser[] = data.clients ?? [];
        setClientsTotal(list.length);
        setClients(list);
        setClientsLoaded(true);
      }
    }
    fetchCounts();
  }, []);

  const fetchClients = async (silent = false) => {
    if (!silent) setClientsLoading(true);
    try {
      const res = await fetch("/api/admin/clients");
      const data = await res.json();
      if (res.ok) {
        setClients(data.clients);
        setClientsTotal(data.clients?.length ?? 0);
      }
    } finally {
      setClientsLoading(false);
      setClientsLoaded(true);
    }
  };

  useEffect(() => {
    if (tab === "Clients" && !clientsLoaded) {
      fetchClients();
    }
  }, [tab, clientsLoaded]);

  // Live refresh: quiet refetch (no "Loading…" row), only once the list has been loaded.
  const refreshClientsRef = useRef(() => {});
  useEffect(() => {
    refreshClientsRef.current = () => {
      if (clientsLoaded) fetchClients(true);
    };
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin-clients-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () =>
        refreshClientsRef.current()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const adminCount = users.filter((u) => u.role === "admin").length;
  const frontDeskCount = users.filter((u) => u.role === "front_desk").length;
  const totalCount = adminCount + frontDeskCount + staffCount + clientsTotal;

  const counts: Record<string, number> = {
    Administrators: adminCount,
    "Front Desk": frontDeskCount,
    Staff: staffCount,
    Clients: clientsTotal,
  };

  const isClientsTab = tab === "Clients";
  const isStaffTab = tab === "Staff";

  const filtered = useMemo(() => {
    const role = tabRoleMap[tab];
    return users.filter((u) => {
      const matchesRole = !role || u.role === role;
      const matchesQuery = query.trim()
        ? u.fullName.toLowerCase().includes(query.toLowerCase()) ||
          u.email.toLowerCase().includes(query.toLowerCase()) ||
          (u.username ?? "").toLowerCase().includes(query.toLowerCase())
        : true;
      return matchesRole && matchesQuery;
    });
  }, [users, tab, query]);

  const filteredClients = useMemo(() => {
    return clients.filter((c) =>
      query.trim()
        ? c.fullName.toLowerCase().includes(query.toLowerCase()) ||
          c.email.toLowerCase().includes(query.toLowerCase())
        : true
    );
  }, [clients, query]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-ink">Users &amp; Roles</h2>
          <p className="mt-0.5 text-base text-ink/55">Who can sign in to GlowSync, and what each of them can do.</p>
        </div>
        {!isClientsTab && !isStaffTab && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-base font-semibold text-white shadow-[0_8px_18px_-10px_rgba(168,137,48,0.9)] transition hover:bg-coral-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-dark"
          >
            <UserPlus className="h-5 w-5" /> Add user
          </button>
        )}
      </div>

      {/* People mix: one bar for everyone, split by role. Each part opens its list. */}
      <section aria-label="People by role" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#efe3c6]">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="leading-none">
            <span className="font-display text-5xl font-semibold tabular-nums text-ink">{totalCount.toLocaleString()}</span>
            <span className="ml-2 text-base text-ink/55">people in GlowSync</span>
          </p>
        </div>
        <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-[#f5eedd]" aria-hidden>
          {MIX.map((m) =>
            counts[m.tab] > 0 ? (
              <span
                key={m.tab}
                className={`h-full transition-opacity ${tab === m.tab ? "opacity-100" : "opacity-80"}`}
                style={{ width: `${(counts[m.tab] / Math.max(1, totalCount)) * 100}%`, background: m.color }}
              />
            ) : null
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MIX.map((m) => {
            const on = tab === m.tab;
            return (
              <button
                key={m.tab}
                onClick={() => setTab(m.tab)}
                aria-pressed={on}
                className={`flex items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-coral-dark ${
                  on ? "bg-[#fbf3dd] ring-1 ring-[#e3cc8f]" : "hover:bg-[#fdf9ef]"
                }`}
              >
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                <span className="min-w-0">
                  <span className="block text-2xl font-semibold tabular-nums leading-tight text-ink">{counts[m.tab].toLocaleString()}</span>
                  <span className="block text-sm font-medium text-ink/75">{m.label}</span>
                  <span className="block text-xs text-ink/45">{m.note}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* List */}
      <div className="rounded-3xl bg-white shadow-sm ring-1 ring-[#efe3c6]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1e7cf] px-6 py-4">
          <div role="tablist" aria-label="Role" className="flex flex-wrap gap-1 rounded-full bg-[#f8f1df] p-1">
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  tab === t ? "bg-white text-ink shadow-sm" : "text-ink/55 hover:text-ink"
                }`}
              >
                {t}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${tab === t ? "bg-[#f3e7c4] text-[#7A5F14]" : "bg-ink/5 text-ink/45"}`}>{counts[t]}</span>
              </button>
            ))}
          </div>
          <label className="flex min-w-[15rem] items-center gap-2 rounded-full border border-ink/10 bg-[#fffdf8] px-4 py-2 text-sm text-ink/50 focus-within:border-coral">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isStaffTab ? "Search name, department or branch" : isClientsTab ? "Search name or email" : "Search name, username or email"}
              aria-label="Search users"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
            />
          </label>
        </div>

        <div className="overflow-x-auto px-6 pb-5">
        {isStaffTab ? (
          <div className="mt-4">
            <StaffMembersPanel query={query} />
          </div>
        ) : isClientsTab ? (
          <table className="mt-2 w-full min-w-[40rem] text-left text-base">
            <thead>
              <tr className="text-sm text-ink/45">
                <th className="py-3 font-medium">Client</th>
                <th className="py-3 font-medium">Email</th>
                <th className="py-3 font-medium">Joined</th>
                <th className="py-3"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr
                  key={client.id}
                  onClick={() => setActiveClient(client)}
                  className="group cursor-pointer border-t border-[#f4ecd9] transition hover:bg-[#fffaf0]"
                >
                  <td className="py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f3e7c4] text-sm font-semibold text-[#7A5F14] ring-2 ring-white">
                        {client.avatarUrl ? (
                          <Image src={client.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
                        ) : (
                          client.fullName.charAt(0).toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{client.fullName}</p>
                        {client.isRestricted && <span className="text-xs font-semibold text-red-600">Restricted</span>}
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 text-ink/70">{client.email}</td>
                  <td className="py-3.5 text-sm text-ink/55">{joined(client.createdAt)}</td>
                  <td className="py-3.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveClient(client);
                      }}
                      aria-label={`Open ${client.fullName}`}
                      className="rounded-full p-2 text-ink/35 transition group-hover:text-coral-dark hover:bg-blush"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {!clientsLoading && filteredClients.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-ink/45">
                    {query.trim() ? `No client matches “${query.trim()}”. Check the spelling or search by email.` : "No client accounts yet. They appear here when someone signs up to book."}
                  </td>
                </tr>
              )}
              {clientsLoading && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-ink/40">
                    Loading clients…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="mt-2 w-full min-w-[40rem] text-left text-base">
            <thead>
              <tr className="text-sm text-ink/45">
                <th className="py-3 font-medium">Person</th>
                <th className="py-3 font-medium">Role</th>
                <th className="py-3 font-medium">Branch</th>
                <th className="py-3 font-medium">Joined</th>
                <th className="py-3"><span className="sr-only">Manage</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => setActiveUser(user)}
                  className="group cursor-pointer border-t border-[#f4ecd9] transition hover:bg-[#fffaf0]"
                >
                  <td className="py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f3e7c4] text-base font-semibold text-[#7A5F14] ring-2 ring-white shadow-sm">
                        {user.avatarUrl ? (
                          <Image src={user.avatarUrl} alt={user.fullName} fill sizes="40px" className="object-cover" />
                        ) : (
                          user.fullName.charAt(0)
                        )}
                      </span>
                      <div>
                        <p className="font-medium text-ink">{user.fullName}</p>
                        <p className="text-sm text-ink/50">
                          @{user.username ?? "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_CHIP[user.role] ?? "bg-ink/5 text-ink/70"}`}>
                      {roleLabels[user.role] ?? user.role}
                    </span>
                  </td>
                  <td className="py-3.5 text-sm text-ink/70">
                    {user.role === "admin" ? (
                      <span className="text-ink/45">All branches</span>
                    ) : user.branchName ? (
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-coral-dark" /> {user.branchName}</span>
                    ) : (
                      <span className="text-amber-700">Not assigned</span>
                    )}
                  </td>
                  <td className="py-3.5 text-sm text-ink/55">{joined(user.createdAt)}</td>
                  <td className="py-3.5 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveUser(user);
                      }}
                      aria-label={`Manage ${user.fullName}`}
                      className="rounded-full p-2 text-ink/35 transition group-hover:text-coral-dark hover:bg-blush"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-ink/45">
                    {query.trim() ? `Nobody here matches “${query.trim()}”.` : `No ${tab === "Administrators" ? "admin" : "front desk"} accounts yet — use Add user to create one.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {!isStaffTab && (
          <p className="mt-3 text-sm text-ink/45">
            {isClientsTab
              ? `${filteredClients.length} of ${clients.length} client accounts`
              : `${filtered.length} ${tab === "Administrators" ? "admin" : "front desk"} account${filtered.length === 1 ? "" : "s"}`}
          </p>
        )}
        </div>
      </div>

      {activeUser && (
        <UserEditPanel
          user={activeUser}
          onClose={() => setActiveUser(null)}
          onDeleted={onRefresh}
          onUpdated={onRefresh}
        />
      )}
      {activeClient && (
        <ClientViewPanel
          client={clients.find((c) => c.id === activeClient.id) ?? activeClient}
          onClose={() => setActiveClient(null)}
          onRestricted={(id, restricted) => {
            setClients((prev) =>
              prev.map((c) =>
                c.id === id ? { ...c, isRestricted: restricted } : c
              )
            );
          }}
        />
      )}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={onRefresh}
        />
      )}
    </div>
  );
}
