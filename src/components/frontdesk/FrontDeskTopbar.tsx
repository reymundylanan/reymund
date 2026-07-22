"use client";

import { useEffect, useState } from "react";
import { Bell, Search } from "lucide-react";
import { useStaffProfile } from "@/lib/hooks/useStaffProfile";
import { createClient } from "@/lib/supabase/client";

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

export default function FrontDeskTopbar() {
  const { profile } = useStaffProfile();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!profile?.branchId) return;

    const supabase = createClient();
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
        (payload) => {
          const row = payload.new as {
            id: string;
            notes: string | null;
            booking_code: string | null;
            status: string;
          };
          const label = row.notes ?? "New appointment";
          const code = row.booking_code ? ` · #${row.booking_code}` : "";
          const status = row.status === "confirmed" ? " ✓ Confirmed" : " · Pending payment";
          setNotifications((prev) => [
            {
              id: row.id,
              message: `${label}${code}${status}`,
              createdAt: new Date().toLocaleTimeString(),
            },
            ...prev,
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.branchId]);

  return (
    <header className="flex items-center justify-between bg-white px-6 py-5" style={{ borderBottom: "1px solid #CFBCA8" }}>
      <div className="flex items-center gap-2 rounded-full px-4 py-2.5 text-base w-full max-w-sm" style={{ border: "1px solid #CFBCA8", color: "#8D6F5D" }}>
        <Search className="h-5 w-5" />
        <input
          type="text"
          placeholder="Search clients, phone numbers, or bookings..."
          className="w-full text-base outline-none"
          style={{ color: "#8D6F5D" }}
        />
      </div>

      <div className="flex items-center gap-4">
        <span className="rounded-full px-5 py-2.5 text-base font-semibold" style={{ backgroundColor: "#DDD5CE", color: "#8D6F5D" }}>
          Branch: {profile?.branchName ?? "Not assigned"}
        </span>

        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Notifications"
            className="relative rounded-full p-2 transition"
            style={{ color: "#8D6F5D" }}
          >
            <Bell className="h-6 w-6" />
            {notifications.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: "#C89D4B" }}>
                {notifications.length}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white p-3 shadow-lg" style={{ border: "1px solid #CFBCA8" }}>
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-sm font-semibold" style={{ color: "#8D6F5D" }}>Notifications</p>
                {notifications.length > 0 && (
                  <button
                    onClick={() => setNotifications([])}
                    className="text-xs font-medium"
                    style={{ color: "#C89D4B" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-1 py-4 text-center text-sm text-ink/40">
                    No new bookings yet.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl p-2 text-sm"
                      style={{ border: "1px solid #CFBCA8" }}
                    >
                      <p style={{ color: "#8D6F5D" }}>{n.message}</p>
                      <p className="mt-0.5 text-xs text-ink/40">{n.createdAt}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold" style={{ backgroundColor: "#CFBCA8", color: "#8D6F5D" }}>
            {profile?.fullName?.charAt(0) ?? "?"}
          </span>
          <div>
            <p className="text-lg font-medium" style={{ color: "#8D6F5D" }}>{profile?.fullName ?? "—"}</p>
            <p className="text-base" style={{ color: "#CFBCA8" }}>
              {profile ? roleLabels[profile.role] : ""}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
