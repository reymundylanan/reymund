"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftRight, Bell, CalendarCheck2, CalendarDays, CalendarOff, ChevronDown, MapPin } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { setAdminBranch } from "@/lib/adminBranch";
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

/** Starts null so the server-rendered markup and the client's first
 * render match exactly — the real clock only starts ticking once
 * mounted client-side, after hydration completes. Otherwise the
 * server's render timestamp and the client's differ by however long
 * the request took, causing a hydration mismatch. */
function useLiveClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

/** The Front Desk page you're on, from the sidebar's pages. */
const SECTIONS: [string, string, string][] = [
  ["/frontdesk/appointments", "Appointments", "Today's bookings, check-ins and new bookings"],
  ["/frontdesk/payments", "Payments", "Online payments to verify and payments at the counter"],
  ["/frontdesk/walk-ins", "Walk-Ins", "Clients who came in without a booking"],
  ["/frontdesk/clients", "Clients", "Find a client, their visits and their account"],
  ["/frontdesk/staff", "Staff Schedule", "Who's in, on break or off today"],
];

function sectionFor(pathname: string) {
  const hit = SECTIONS.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
  return hit ? { title: hit[1], hint: hit[2] } : { title: "Dashboard", hint: "Today at your branch" };
}

/** An icon for each kind of notice (from its id). */
function noticeIcon(id: string) {
  if (id.startsWith("leave-") || id.startsWith("shift-")) return { Icon: CalendarOff, tone: "bg-rose-50 text-rose-500" };
  if (id.startsWith("transfer")) return { Icon: ArrowLeftRight, tone: "bg-skin text-coral-dark" };
  return { Icon: CalendarCheck2, tone: "bg-green-50 text-green-600" };
}

function firstName(fullName: string | null | undefined) {
  if (!fullName) return null;
  return fullName.trim().split(/\s+/)[0];
}

function formatScheduled(dateKey: string, timeStr: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  const date = new Date(y, m - 1, d, h, min);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
  const { profile, branches } = useStaffProfile();
  const router = useRouter();
  const clock = useLiveClock();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;
  const section = sectionFor(usePathname() ?? "/frontdesk");
  const bellRef = useRef<HTMLDivElement>(null);
  const loadedFor = useRef<string | null>(null);

  // Click outside or press Escape to close the notifications.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!bellRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!profile?.branchId) return;
    const key = `frontdesk-read-notifications-${profile.branchId}`;
    const id = setTimeout(() => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) setReadIds(new Set(JSON.parse(raw)));
      } catch {
        // localStorage unavailable (private browsing, blocked storage) — read state just won't persist.
      }
      loadedFor.current = profile.branchId;
    }, 0);
    return () => clearTimeout(id);
  }, [profile?.branchId]);

  useEffect(() => {
    // Don't save until this branch's saved read-state has been loaded.
    if (!profile?.branchId || loadedFor.current !== profile.branchId) return;
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
      .select("id, notes, booking_code, status, created_at, scheduled_date, start_time, client:profiles!appointments_client_id_fkey(full_name)")
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
          scheduled_date: string;
          start_time: string;
          client: { full_name: string } | { full_name: string }[] | null;
        }[];
        const current = rows.map((row) => {
          const clientRel = Array.isArray(row.client) ? row.client[0] : row.client;
          const name = firstName(clientRel?.full_name);
          const label = row.notes ?? "New appointment";
          const namePrefix = name ? `${name} — ` : "";
          const code = row.booking_code ? ` · #${row.booking_code}` : "";
          const when = ` · ${formatScheduled(row.scheduled_date, row.start_time)}`;
          const status =
            row.status === "confirmed"
              ? " ✓ Confirmed"
              : row.status === "cancelled"
                ? " · Cancelled"
                : " · Pending payment";
          return {
            id: row.id,
            message: `${namePrefix}${label}${code}${when}${status}`,
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
            scheduled_date: string;
            start_time: string;
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
          const when = ` · ${formatScheduled(row.scheduled_date, row.start_time)}`;
          const status = row.status === "confirmed" ? " ✓ Confirmed" : " · Pending payment";
          setNotifications((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            return [
              {
                id: row.id,
                message: `${namePrefix}${label}${code}${when}${status}`,
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

  const name = profile?.fullName ?? "—";
  const chip = "rounded-full bg-white ring-1 ring-[#efe3c6]";

  return (
    <header className="flex items-center justify-between gap-4 border-b border-nude/70 bg-[#FFFDF8]/90 px-6 py-3.5 backdrop-blur">
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold leading-tight text-ink">{section.title}</p>
        <p className="hidden truncate text-xs text-ink/50 md:block">{section.hint}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {clock && (
          <div className={`hidden items-center gap-2.5 px-4 py-2 xl:flex ${chip}`}>
            <CalendarDays className="h-4 w-4 text-coral-dark" aria-hidden />
            <span className="text-sm font-medium text-ink">
              {clock.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span className="h-4 w-px bg-ink/10" aria-hidden />
            <span className="text-sm tabular-nums text-ink/60">
              {clock.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
            </span>
          </div>
        )}

        {profile?.role === "admin" && branches.length > 0 ? (
          // Admins pick which branch the Front Desk screens show.
          <label className={`relative flex items-center gap-2 py-2 pl-3.5 pr-3 ${chip} focus-within:ring-coral/60`}>
            <MapPin className="h-4 w-4 shrink-0 text-coral-dark" aria-hidden />
            <span className="sr-only">Branch to view</span>
            <select
              value={profile.branchId ?? ""}
              onChange={(e) => {
                setAdminBranch(e.target.value);
                router.refresh();
              }}
              className="max-w-[12rem] cursor-pointer appearance-none truncate bg-transparent pr-5 text-sm font-semibold text-ink outline-none"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-ink/40" aria-hidden />
          </label>
        ) : (
          <span className={`flex items-center gap-2 px-3.5 py-2 ${chip}`}>
            <MapPin className="h-4 w-4 shrink-0 text-coral-dark" aria-hidden />
            <span className="max-w-[12rem] truncate text-sm font-semibold text-ink">{profile?.branchName ?? "No branch assigned"}</span>
          </span>
        )}

        <div ref={bellRef} className="relative">
          <button
            onClick={toggleOpen}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} new` : "Notifications"}
            aria-expanded={open}
            className={`relative grid h-10 w-10 place-items-center text-ink/55 transition hover:text-coral-dark hover:ring-coral/50 ${chip} ${open ? "text-coral-dark ring-coral/50" : ""}`}
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold text-white ring-2 ring-[#FFFDF8]">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {open && (
            <div className="glowy-msg absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-[#efe3c6] bg-white shadow-[0_24px_48px_-24px_rgba(70,48,18,0.35)]">
              <div className="flex items-center justify-between border-b border-[#f3ead6] px-4 py-3">
                <p className="text-sm font-semibold text-ink">
                  Notifications
                  {notifications.length > 0 && <span className="ml-1.5 font-normal text-ink/40">{notifications.length}</span>}
                </p>
                {notifications.length > 0 && (
                  <button
                    onClick={() => {
                      setNotifications([]);
                      setReadIds(new Set());
                    }}
                    className="text-xs font-semibold text-coral-dark hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-cream text-coral-dark">
                      <Bell className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="text-sm font-medium text-ink">You&apos;re all caught up</p>
                    <p className="text-xs text-ink/50">New bookings, leaves and transfers for this branch show here.</p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {notifications.map((n) => {
                      const { Icon, tone } = noticeIcon(n.id);
                      return (
                        <li key={n.id} className="flex gap-3 rounded-xl p-2.5 transition hover:bg-cream">
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${tone}`}>
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm leading-snug text-ink">{n.message}</p>
                            <p className="mt-0.5 text-xs text-ink/40">{n.createdAt}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={`flex items-center gap-3 py-1 pl-1 pr-1 md:pr-4 ${chip}`}>
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-champagne bg-skin text-base font-semibold text-coral-dark">
            {profile?.avatarUrl ? (
              <Image src={profile.avatarUrl} alt={name} fill sizes="36px" className="object-cover" />
            ) : (
              profile?.fullName?.charAt(0) ?? "?"
            )}
          </span>
          <div className="hidden leading-tight md:block">
            <p className="max-w-[10rem] truncate text-sm font-semibold text-ink">{name}</p>
            <p className="text-[11px] text-taupe">{profile ? roleLabels[profile.role] : ""}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
