"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, MoreHorizontal, Search, UserPlus } from "lucide-react";
import UserEditPanel from "@/components/admin/users/UserEditPanel";
import ClientViewPanel from "@/components/admin/users/ClientViewPanel";
import CreateUserModal from "@/components/admin/users/CreateUserModal";
import StaffMembersPanel from "@/components/admin/users/StaffMembersPanel";
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

  const fetchClients = async () => {
    setClientsLoading(true);
    try {
      const res = await fetch("/api/admin/clients");
      const data = await res.json();
      if (res.ok) setClients(data.clients);
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
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Users &amp; Roles</h2>
          <p className="text-sm text-ink/50">
            {isClientsTab
              ? "Customer accounts created via Google or Facebook sign-in."
              : "Manage system access for Admin and Front Desk staff accounts."}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            <Download className="h-4 w-4" /> Export Data
          </button>
          {!isClientsTab && !isStaffTab && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark"
            >
              <UserPlus className="h-4 w-4" /> Add New User
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                tab === t
                  ? "bg-coral text-white"
                  : "text-ink/50 hover:text-coral-dark"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isStaffTab ? "Search name, dept. or branch..." : "Search name or email..."}
            className="w-48 text-sm outline-none placeholder:text-ink/40"
          />
        </div>
      </div>

      {isStaffTab ? (
        <div className="mt-4">
          <StaffMembersPanel query={query} />
        </div>
      ) : isClientsTab ? (
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-ink/40">
              <th className="py-2">Client Profile</th>
              <th className="py-2">Email</th>
              <th className="py-2">Joined</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => (
              <tr key={client.id} className="border-t border-ink/5">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-semibold text-coral-dark">
                      {client.fullName.charAt(0)}
                    </span>
                    <p className="font-medium text-ink">{client.fullName}</p>
                  </div>
                </td>
                <td className="py-3 text-ink/70">{client.email}</td>
                <td className="py-3 text-ink/50">
                  {new Date(client.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => setActiveClient(client)}
                    className="rounded-full p-2 text-ink/40 hover:bg-blush hover:text-ink"
                  >
                    <MoreHorizontal className="h-4 w-4" />
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
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-ink/40">
              <th className="py-2">User Profile</th>
              <th className="py-2">Role</th>
              <th className="py-2">Branch</th>
              <th className="py-2">Joined</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id} className="border-t border-ink/5">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-semibold text-coral-dark">
                      {user.fullName.charAt(0)}
                    </span>
                    <div>
                      <p className="font-medium text-ink">{user.fullName}</p>
                      <p className="text-xs text-ink/50">
                        @{user.username ?? "—"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3 text-ink/70">{roleLabels[user.role]}</td>
                <td className="py-3 text-ink/70">{user.branchName ?? "—"}</td>
                <td className="py-3 text-ink/50">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="py-3">
                  <button
                    onClick={() => setActiveUser(user)}
                    className="rounded-full p-2 text-ink/40 hover:bg-blush hover:text-ink"
                  >
                    <MoreHorizontal className="h-4 w-4" />
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
        <p className="mt-4 text-sm text-ink/50">
          {isClientsTab
            ? `Showing ${filteredClients.length} of ${clients.length} client accounts`
            : `Showing ${filtered.length} of ${users.length} staff accounts`}
        </p>
      )}

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
            setClients((prev) => prev.map((c) => c.id === id ? { ...c, isRestricted: restricted } : c));
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
