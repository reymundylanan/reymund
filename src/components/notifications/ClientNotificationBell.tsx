"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarCheck, CalendarX, Sparkles, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  listClientNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ClientNotification,
} from "@/lib/supabase/queries/clientNotifications";
import { timeAgo } from "@/lib/timeAgo";

/** Header bell for signed-in clients: unread count + a dropdown of booking
 * updates (confirmed / cancelled). Stays in sync live via Realtime. */
export default function ClientNotificationBell({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [open, setOpen] = useState(false);

  const reload = useCallback(() => {
    listClientNotifications(createClient(), clientId).then(setItems);
  }, [clientId]);

  useEffect(() => {
    reload();
    const supabase = createClient();
    const channel = supabase
      .channel(`client-notif-bell-${clientId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_notifications", filter: `client_id=eq.${clientId}` },
        () => reload()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, reload]);

  const unread = items.filter((n) => !n.readAt).length;

  async function openItem(n: ClientNotification) {
    setOpen(false);
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      await markNotificationRead(createClient(), n.id);
    }
    router.push(n.linkPath);
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    await markAllNotificationsRead(createClient(), clientId);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative rounded-full p-2.5 text-ink/60 hover:bg-blush hover:text-coral-dark"
      >
        <Bell className="h-6 w-6" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <p className="text-sm font-semibold text-ink">Notifications</p>
              {unread > 0 && (
                <button type="button" onClick={markAll} className="text-xs font-medium text-coral-dark hover:underline">
                  Mark all as read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink/40">No notifications yet.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-ink/5 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-blush/50 ${n.readAt ? "" : "bg-amber-50/60"}`}
                    >
                      {n.kind === "confirmed" ? (
                        <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                      ) : n.kind === "review_reward" ? (
                        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                      ) : n.kind === "review_request" ? (
                        <Star className="mt-0.5 h-5 w-5 shrink-0 fill-gold text-gold" />
                      ) : (
                        <CalendarX className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">{n.title}</span>
                        <span className="block text-xs text-ink/60">{n.body}</span>
                        <span className="mt-0.5 block text-[11px] text-ink/40">{timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
