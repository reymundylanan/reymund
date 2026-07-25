"use client";

import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Search, UserPlus, Users, ShieldCheck, UserCog, MonitorSmartphone, UserCircle } from "lucide-react";
import UserEditPanel from "@/components/admin/users/UserEditPanel";
import ClientViewPanel from "@/components/admin/users/ClientViewPanel";
import CreateUserModal from "@/components/admin/users/CreateUserModal";
import StaffMembersPanel from "@/components/admin/users/StaffMembersPanel";
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

  const fetchClients = async () => {
    setClientsLoading(true);
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
          <h2 className="text-xl font-semibold text-ink">Users &amp; Roles</h2>
          <p className="text-base text-ink/50">
            Manage system users, assign roles, and control access permissions.
          </p>
        </div>
        {!isClientsTab && !isStaffTab && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-base font-semibold text-white hover:bg-coral-dark"
          >
            <UserPlus className="h-5 w-5" /> Add User
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: card.iconBg, color: card.iconColor }}
            >
              {card.icon}
            </span>
            <div>
              <p className="text-sm text-ink/50">{card.label}</p>
              <p className="text-2xl font-bold text-ink">
                {card.value.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-ink/40">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-4">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-2 text-base font-medium ${
                  tab === t
                    ? "bg-coral text-white"
                    : "text-ink/50 hover:text-coral-dark"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-base text-ink/50">
            <Search className="h-5 w-5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isStaffTab
                  ? "Search name, dept. or branch..."
                  : "Search name or email..."
              }
              className="w-48 text-base outline-none placeholder:text-ink/40"
            />
          </div>
        </div>

        {isStaffTab ? (
          <div className="mt-4">
            <StaffMembersPanel query={query} />
          </div>
        ) : isClientsTab ? (
          <table className="mt-4 w-full text-left text-base">
            <thead>
              <tr className="text-sm uppercase text-ink/40">
                <th className="py-3">Client Profile</th>
                <th className="py-3">Email</th>
                <th className="py-3">Joined</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr key={client.id} className="border-t border-ink/5">
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush text-base font-semibold text-coral-dark">
                        {client.fullName.charAt(0)}
                      </span>
                      <p className="font-medium text-ink">{client.fullName}</p>
                    </div>
                  </td>
                  <td className="py-4 text-ink/70">{client.email}</td>
                  <td className="py-4 text-ink/50">
                    {new Date(client.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-4">
                    <button
                      onClick={() => setActiveClient(client)}
                      className="rounded-full p-2 text-ink/40 hover:bg-blush hover:text-ink"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {!clientsLoading && filteredClients.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-ink/40">
                    No client accounts match this filter.
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
          <table className="mt-4 w-full text-left text-base">
            <thead>
              <tr className="text-sm uppercase text-ink/40">
                <th className="py-3">User Profile</th>
                <th className="py-3">Role</th>
                <th className="py-3">Branch</th>
                <th className="py-3">Joined</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-t border-ink/5">
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush text-base font-semibold text-coral-dark">
                        {user.fullName.charAt(0)}
                      </span>
                      <div>
                        <p className="font-medium text-ink">{user.fullName}</p>
                        <p className="text-sm text-ink/50">
                          @{user.username ?? "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 text-ink/70">{roleLabels[user.role]}</td>
                  <td className="py-4 text-ink/70">{user.branchName ?? "—"}</td>
                  <td className="py-4 text-ink/50">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-4">
                    <button
                      onClick={() => setActiveUser(user)}
                      className="rounded-full p-2 text-ink/40 hover:bg-blush hover:text-ink"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ink/40">
                    No staff accounts match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {!isStaffTab && (
          <p className="mt-4 text-base text-ink/50">
            {isClientsTab
              ? `Showing ${filteredClients.length} of ${clients.length} client accounts`
              : `Showing ${filtered.length} of ${users.length} staff accounts`}
          </p>
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
          client={activeClient}
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
