"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Bell } from "lucide-react";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { createClient } from "@/lib/supabase/client";
import { getLeaveRequestsForBranch } from "@/lib/supabase/queries/leaveRequests";
import {
  getUpcomingTransfersIntoBranch,
  getUpcomingTransfersFromBranch,
} from "@/lib/supabase/queries/branchTransferRequests";
import { toDateKey } from "@/lib/supabase/queries/staffShifts";

const roleLabels: Record<string, string> = {
  admin: "Admin",
  front_desk: "Front Desk",
  specialist: "Specialist",
};

type Notification = {
  id: string;
  message: string;
  createdAt: string;
};

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function firstName(fullName: string | null | undefined) {
  if (!fullName) return null;
  return fullName.trim().split(/\s+/)[0];
}

function formatDateRange(sortedDateKeys: string[]) {
  const fmt = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  if (sortedDateKeys.length === 1) return fmt(sortedDateKeys[0]);
  return `${fmt(sortedDateKeys[0])} – ${fmt(sortedDateKeys[sortedDateKeys.length - 1])}`;
}

export default function FrontDeskTopbar() {
  const { profile } = useStaffProfile();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  useEffect(() => {
    if (!profile?.branchId) return;
    try {
      const raw = localStorage.getItem(`frontdesk-read-notifications-${profile.branchId}`);
      if (raw) setReadIds(new Set(JSON.parse(raw)));
    } catch {
      // localStorage unavailable (private browsing, blocked storage) — read state just won't persist.
    }
  }, [profile?.branchId]);

  useEffect(() => {
    if (!profile?.branchId) return;
    try {
      localStorage.setItem(
        `frontdesk-read-notifications-${profile.branchId}`,
        JSON.stringify(Array.from(readIds))
      );
    } catch {
      // localStorage unavailable — nothing to do.
    }
  }, [readIds, profile?.branchId]);

  function toggleOpen() {
    setOpen((o) => {
      const next = !o;
      if (next) setReadIds(new Set(notifications.map((n) => n.id)));
      return next;
    });
  }

  useEffect(() => {
    if (!profile?.branchId) return;
    let cancelled = false;

    const supabase = createClient();

    const todayKey = toDateKey(new Date());
    getLeaveRequestsForBranch(supabase, profile.branchId).then((leaves) => {
      if (cancelled) return;
      const current = leaves
        .filter((lr) => lr.status === "approved" && lr.dates.some((d) => d >= todayKey))
        .map((lr) => {
          const sorted = [...lr.dates].sort();
          const name = lr.staff_member?.full_name ?? "A staff member";
          return {
            id: `leave-${lr.id}`,
            message: `${name} is on leave — ${formatDateRange(sorted)}`,
            createdAt: formatTime(new Date()),
          };
        });
      if (current.length > 0) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          return [...current.filter((n) => !existingIds.has(n.id)), ...prev];
        });
      }
    });

    getUpcomingTransfersIntoBranch(supabase, profile.branchId).then((rows) => {
      if (cancelled) return;
      const current = rows
        .map((r) => {
          const upcoming = r.dates.filter((d) => d >= todayKey);
          if (upcoming.length === 0) return null;
          return {
            id: `transfer-in-${r.staff_member_id}`,
            message: `${r.full_name} is joining your branch — ${formatDateRange([...upcoming].sort())}`,
            createdAt: formatTime(new Date()),
          };
        })
        .filter((n): n is Notification => n !== null);
      if (current.length > 0) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          return [...current.filter((n) => !existingIds.has(n.id)), ...prev];
        });
      }
    });

    getUpcomingTransfersFromBranch(supabase, profile.branchId).then((rows) => {
      if (cancelled) return;
      const current = rows
        .map((r) => {
          const upcoming = r.dates.filter((d) => d >= todayKey);
          if (upcoming.length === 0) return null;
          return {
            id: `transfer-out-${r.staff_member_id}`,
            message: `${r.full_name} has been transferred to ${r.target_branch_name} — ${formatDateRange([...upcoming].sort())}`,
            createdAt: formatTime(new Date()),
          };
        })
        .filter((n): n is Notification => n !== null);
      if (current.length > 0) {
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          return [...current.filter((n) => !existingIds.has(n.id)), ...prev];
        });
      }
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    supabase
      .from("appointments")
      .select("id, notes, booking_code, status, created_at, client:profiles(full_name)")
      .eq("branch_id", profile.branchId)
      .gte("created_at", todayStart.toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as unknown as {
          id: string;
          notes: string | null;
          booking_code: string | null;
          status: string;
          created_at: string;
          client: { full_name: string } | { full_name: string }[] | null;
        }[];
        const current = rows.map((row) => {
          const clientRel = Array.isArray(row.client) ? row.client[0] : row.client;
          const name = firstName(clientRel?.full_name);
          const label = row.notes ?? "New appointment";
          const namePrefix = name ? `${name} — ` : "";
          const code = row.booking_code ? ` · #${row.booking_code}` : "";
          const status =
            row.status === "confirmed"
              ? " ✓ Confirmed"
              : row.status === "cancelled"
                ? " · Cancelled"
                : " · Pending payment";
          return {
            id: row.id,
            message: `${namePrefix}${label}${code}${status}`,
            createdAt: formatTime(new Date(row.created_at)),
          };
        });
        if (current.length > 0) {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            return [...current.filter((n) => !existingIds.has(n.id)), ...prev];
          });
        }
      });

    async function handleStaffOffChange(newRow: unknown) {
      const row = newRow as {
        id: string;
        staff_member_id: string;
        shift_date: string;
        period: "full_day" | "morning" | "afternoon";
        source: "manual" | "leave" | "transfer";
      };
      if (row.source === "transfer") {
        const { data: transferReq } = await supabase
          .from("branch_transfer_requests")
          .select("branch:branches!target_branch_id(name)")
          .eq("staff_member_id", row.staff_member_id)
          .eq("status", "approved")
          .contains("dates", [row.shift_date])
          .limit(1)
          .maybeSingle();
        if (!transferReq) return;
        const branchRel = transferReq.branch as { name: string } | { name: string }[] | null;
        const branchName = (Array.isArray(branchRel) ? branchRel[0]?.name : branchRel?.name) ?? "another branch";
        const { data: staff } = await supabase
          .from("staff_members")
          .select("full_name")
          .eq("id", row.staff_member_id)
          .single();
        const name = staff?.full_name ?? "A staff member";
        const dateLabel = new Date(`${row.shift_date}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        setNotifications((prev) => {
          const id = `transfer-out-shift-${row.id}`;
          if (prev.some((n) => n.id === id)) return prev;
          return [
            {
              id,
              message: `${name} has been transferred to ${branchName} — ${dateLabel}`,
              createdAt: formatTime(new Date()),
            },
            ...prev,
          ];
        });
        return;
      }
      const { data: staff } = await supabase
        .from("staff_members")
        .select("full_name")
        .eq("id", row.staff_member_id)
        .single();
      const name = staff?.full_name ?? "A staff member";
      const periodLabel =
        row.period === "full_day" ? "Whole Day" : row.period === "morning" ? "Morning" : "Afternoon";
      const dateLabel = new Date(`${row.shift_date}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      setNotifications((prev) => {
        const id = `shift-${row.id}`;
        if (prev.some((n) => n.id === id)) return prev;
        return [
          {
            id,
            message: `${name} is on leave (${periodLabel}) — ${dateLabel}`,
            createdAt: formatTime(new Date()),
          },
          ...prev,
        ];
      });
    }

    const channel = supabase
      .channel(`frontdesk-notify-${profile.branchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
          filter: `branch_id=eq.${profile.branchId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            notes: string | null;
            booking_code: string | null;
            status: string;
            client_id: string | null;
          };
          let name: string | null = null;
          if (row.client_id) {
            const { data: client } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", row.client_id)
              .single();
            name = firstName(client?.full_name);
          }
          const namePrefix = name ? `${name} — ` : "";
          const label = row.notes ?? "New appointment";
          const code = row.booking_code ? ` · #${row.booking_code}` : "";
          const status = row.status === "confirmed" ? " ✓ Confirmed" : " · Pending payment";
          setNotifications((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            return [
              {
                id: row.id,
                message: `${namePrefix}${label}${code}${status}`,
                createdAt: formatTime(new Date()),
              },
              ...prev,
            ];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "staff_shifts",
          filter: `branch_id=eq.${profile.branchId}`,
        },
        (payload) => handleStaffOffChange(payload.new)
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "staff_shifts",
          filter: `branch_id=eq.${profile.branchId}`,
        },
        (payload) => handleStaffOffChange(payload.new)
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "branch_transfer_requests",
          filter: `target_branch_id=eq.${profile.branchId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            staff_member_id: string;
            dates: string[];
            status: string;
          };
          if (row.status !== "approved") return;
          const { data: staff } = await supabase
            .from("staff_members")
            .select("full_name")
            .eq("id", row.staff_member_id)
            .single();
          const name = staff?.full_name ?? "A staff member";
          const dateLabels = row.dates
            .map((d) =>
              new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            )
            .join(", ");
          setNotifications((prev) => [
            {
              id: `transfer-${row.id}`,
              message: `${name} is joining your branch — ${dateLabels}`,
              createdAt: formatTime(new Date()),
            },
            ...prev,
          ]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profile?.branchId]);

  return (
    <header className="flex items-center justify-between border-b border-ink/10 bg-white px-6 py-5">
      <div className="flex items-center gap-2">
        <Image
          src="/images/logo/blushnewlogo.jpeg"
          alt="Blush Spa & Aesthetics"
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 object-contain"
        />
        <span className="whitespace-nowrap text-lg font-semibold text-coral-dark">
          Blush Spa &amp; Aesthetics
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="rounded-full bg-blush px-5 py-2.5 text-base font-semibold text-coral-dark">
          Branch: {profile?.branchName ?? "Not assigned"}
        </span>

        <div className="relative">
          <button
            onClick={toggleOpen}
            aria-label="Notifications"
            className="relative rounded-full p-2 text-ink/60 transition hover:bg-blush"
          >
            <Bell className="h-6 w-6" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-ink/10 bg-white p-3 shadow-lg">
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-sm font-semibold text-ink">Notifications</p>
                {notifications.length > 0 && (
                  <button
                    onClick={() => {
                      setNotifications([]);
                      setReadIds(new Set());
                    }}
                    className="text-xs font-medium text-coral-dark"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-1 py-4 text-center text-sm text-ink/40">
                    No new notifications yet.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-ink/10 p-2 text-sm"
                    >
                      <p className="text-ink">{n.message}</p>
                      <p className="mt-0.5 text-sm text-ink/40">{n.createdAt}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blush text-base font-semibold text-coral-dark">
            {profile?.fullName?.charAt(0) ?? "?"}
          </span>
          <div>
            <p className="text-lg font-medium text-ink">{profile?.fullName ?? "—"}</p>
            <p className="text-base text-ink/50">
              {profile ? roleLabels[profile.role] : ""}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
