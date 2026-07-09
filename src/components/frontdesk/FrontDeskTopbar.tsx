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
          const row = payload.new as { id: string; notes: string | null };
          setNotifications((prev) => [
            {
              id: row.id,
              message: row.notes
                ? `New booking: ${row.notes}`
                : "New booking received.",
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
    <header className="flex items-center justify-between border-b border-ink/10 bg-white px-6 py-5">
      <div className="flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2.5 text-base text-ink/50 w-full max-w-sm">
        <Search className="h-5 w-5" />
        <input
          type="text"
          placeholder="Search clients, phone numbers, or bookings..."
          className="w-full text-base outline-none placeholder:text-ink/40"
        />
      </div>

      <div className="flex items-center gap-4">
        <span className="rounded-full bg-blush px-5 py-2.5 text-base font-semibold text-coral-dark">
          Branch: {profile?.branchName ?? "Not assigned"}
        </span>

        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Notifications"
            className="relative rounded-full p-2 text-ink/70 hover:bg-blush"
          >
            <Bell className="h-6 w-6" />
            {notifications.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-coral text-[10px] font-semibold text-white">
                {notifications.length}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-ink/10 bg-white p-3 shadow-lg">
              <div className="flex items-center justify-between px-1 pb-2">
                <p className="text-sm font-semibold text-ink">Notifications</p>
                {notifications.length > 0 && (
                  <button
                    onClick={() => setNotifications([])}
                    className="text-xs font-medium text-coral-dark"
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
                      className="rounded-xl border border-ink/10 p-2 text-sm"
                    >
                      <p className="text-ink/80">{n.message}</p>
                      <p className="mt-0.5 text-xs text-ink/40">{n.createdAt}</p>
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
            <p className="text-base font-medium text-ink">{profile?.fullName ?? "—"}</p>
            <p className="text-sm text-ink/50">
              {profile ? roleLabels[profile.role] : ""}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
