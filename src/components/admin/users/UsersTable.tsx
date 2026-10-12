"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, MoreHorizontal, Plus, Search, Users, ShieldCheck, UserCog, MonitorSmartphone, UserCircle } from "lucide-react";
import { TABLE_HEAD, TABLE_WRAP, TABLE_ROW } from "@/components/admin/users/tableStyle";
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

const joined = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const roleChip: Record<string, string> = {
  admin: "bg-ink text-white",
  front_desk: "bg-[#F3E7C4] text-[#7A5F14]",
};

const roleLabels: Record<string, string> = {
  admin: "Admin",
  front_desk: "Front Desk",
};

type StatCard = {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
};

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
  const [showCreate, setShowCreate] = useState<"admin" | "front_desk" | null>(null);

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

  const statCards: StatCard[] = [
    {
      label: "Total Users",
      value: totalCount,
      sub: "Across all roles",
      icon: <Users className="h-6 w-6" />,
      iconBg: "#EDE9FE",
      iconColor: "#7C3AED",
    },
    {
      label: "Administrators",
      value: adminCount,
      sub: "All branches access",
      icon: <ShieldCheck className="h-6 w-6" />,
      iconBg: "#FFE4E6",
      iconColor: "#E11D48",
    },
    {
      label: "Staff / Therapists",
      value: staffCount,
      sub: "Assigned to branches",
      icon: <UserCog className="h-6 w-6" />,
      iconBg: "#DBEAFE",
      iconColor: "#2563EB",
    },
    {
      label: "Front Desk",
      value: frontDeskCount,
      sub: "Active accounts",
      icon: <MonitorSmartphone className="h-6 w-6" />,
      iconBg: "#FEF3C7",
      iconColor: "#D97706",
    },
    {
      label: "Customers",
      value: clientsTotal,
      sub: "Registered clients",
      icon: <UserCircle className="h-6 w-6" />,
      iconBg: "#DCFCE7",
      iconColor: "#16A34A",
    },
  ];

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-ink">Users &amp; Roles</h2>
          <p className="text-base text-ink/50">
            Manage system users, assign roles, and control access permissions.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-white p-5 shadow-[0_10px_30px_-22px_rgba(90,60,20,0.45)] ring-1 ring-[#efe3c6]"
          >
            <div className="flex items-center justify-between">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{ backgroundColor: card.iconBg, color: card.iconColor }}
              >
                {card.icon}
              </span>
            </div>
            <div>
              <p className="text-3xl font-semibold tabular-nums leading-none text-ink">
                {card.value.toLocaleString()}
              </p>
              <p className="mt-2 text-sm font-medium text-ink/75">{card.label}</p>
              <p className="mt-0.5 text-xs text-ink/45">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-3xl bg-white p-6 shadow-[0_10px_30px_-22px_rgba(90,60,20,0.45)] ring-1 ring-[#efe3c6]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1e7cf] pb-4">
          <div role="tablist" aria-label="Role" className="flex flex-wrap gap-1 rounded-full bg-[#f8f1df] p-1">
            {tabs.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 text-base font-semibold transition ${
                  tab === t
                    ? "bg-coral text-white shadow-sm"
                    : "text-ink/55 hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-[#fffdf8] px-4 py-2 text-base text-ink/50 focus-within:border-coral">
            <Search className="h-5 w-5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isStaffTab
                  ? "Search name, dept. or branch..."
                  : "Search name or email..."
              }
              aria-label="Search users"
              className="w-52 bg-transparent text-base text-ink outline-none placeholder:text-ink/40"
            />
          </div>
        </div>

        {isStaffTab ? (
          <div className="mt-4">
            <StaffMembersPanel query={query} />
          </div>
        ) : (
          <div className="mt-4">
            {/* Same toolbar as the Staff tab: count on the left, Add on the right */}
            <div className="mb-4 flex min-h-9 flex-wrap items-center justify-between gap-3">
              <p className="text-base text-ink/50">
                {isClientsTab
                  ? `${clients.length} client${clients.length === 1 ? "" : "s"}`
                  : tab === "Administrators"
                    ? `${adminCount} administrator${adminCount === 1 ? "" : "s"}`
                    : `${frontDeskCount} front desk account${frontDeskCount === 1 ? "" : "s"}`}
                {query.trim() && <span className="text-ink/40"> · {isClientsTab ? filteredClients.length : filtered.length} match{(isClientsTab ? filteredClients.length : filtered.length) === 1 ? "" : "es"}</span>}
              </p>
              {!isClientsTab && (
                <button
                  onClick={() => setShowCreate(tab === "Administrators" ? "admin" : "front_desk")}
                  className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
                >
                  <Plus className="h-4 w-4" /> {tab === "Administrators" ? "Add Admin" : "Add Front Desk"}
                </button>
              )}
            </div>

            {isClientsTab ? (
              <div className={TABLE_WRAP}>
                <table className="w-full min-w-[40rem] text-left text-base">
                  <thead>
                    <tr className={TABLE_HEAD}>
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => (
                      <tr key={client.id} onClick={() => setActiveClient(client)} className={TABLE_ROW}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f3e7c4] text-base font-semibold text-[#7A5F14] ring-2 ring-white">
                              {client.avatarUrl ? <Image src={client.avatarUrl} alt="" fill sizes="40px" className="object-cover" /> : client.fullName.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium text-ink">{client.fullName}</span>
                            {client.isRestricted && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Restricted</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ink/70">{client.email}</td>
                        <td className="px-4 py-3 text-sm text-ink/55">{joined(client.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveClient(client);
                            }}
                            aria-label={`Open ${client.fullName}`}
                            className="rounded-full p-2 text-ink/40 transition group-hover:text-coral-dark hover:bg-blush"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!clientsLoading && filteredClients.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-ink/40">{query.trim() ? "No clients match your search." : "No client accounts yet."}</td>
                      </tr>
                    )}
                    {clientsLoading && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-ink/40">Loading clients…</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={TABLE_WRAP}>
                <table className="w-full min-w-[44rem] text-left text-base">
                  <thead>
                    <tr className={TABLE_HEAD}>
                      <th className="px-4 py-3">{tab === "Administrators" ? "Administrator" : "Front Desk"}</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((user) => (
                      <tr key={user.id} onClick={() => setActiveUser(user)} className={TABLE_ROW}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f3e7c4] text-base font-semibold text-[#7A5F14] ring-2 ring-white">
                              {user.avatarUrl ? <Image src={user.avatarUrl} alt={user.fullName} fill sizes="40px" className="object-cover" /> : user.fullName.charAt(0)}
                            </span>
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-medium text-ink">
                                {user.fullName}
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${roleChip[user.role] ?? "bg-ink/5 text-ink/70"}`}>{roleLabels[user.role] ?? user.role}</span>
                              </p>
                              <p className="text-sm text-ink/50">@{user.username ?? "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[16rem] truncate px-4 py-3 text-sm text-ink/70" title={user.email}>{user.email}</td>
                        <td className="px-4 py-3 text-sm text-ink/70">
                          {user.branchName ? (
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-coral-dark" /> {user.branchName}</span>
                          ) : (
                            <span className="text-ink/45">{user.role === "admin" ? "All branches" : "—"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink/55">{joined(user.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveUser(user);
                            }}
                            aria-label={`Manage ${user.fullName}`}
                            className="rounded-full p-2 text-ink/40 transition group-hover:text-coral-dark hover:bg-blush"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-ink/40">
                          {query.trim() ? "No accounts match your search." : tab === "Administrators" ? "No administrators yet." : "No front desk accounts yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
          initialRole={showCreate}
          onClose={() => setShowCreate(null)}
          onCreated={onRefresh}
        />
      )}
    </div>
  );
}
