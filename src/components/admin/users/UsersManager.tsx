"use client";

import { useCallback, useEffect, useState } from "react";
import UsersTable from "@/components/admin/users/UsersTable";
import type { StaffUser } from "@/components/admin/users/types";

export default function UsersManager() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load users.");
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-ink/40 shadow-sm">
        Loading staff accounts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-red-600 shadow-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UsersTable users={users} onRefresh={fetchUsers} />
    </div>
  );
}
