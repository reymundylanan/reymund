"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarX, Sparkles, Star, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { toClientNotification, type ClientNotification } from "@/lib/supabase/queries/clientNotifications";

const TOAST_MS = 8000;
const MAX_TOASTS = 3;

/** Live pop-up (top-right, non-blocking) when the front desk confirms or
 * cancels one of the signed-in client's bookings while they're on the site. */
export default function ClientNotificationToaster() {
  const { user } = useCurrentUser();
  const clientId = user?.role === "customer" ? user.id : null;
  const [toasts, setToasts] = useState<ClientNotification[]>([]);

  useEffect(() => {
    if (!clientId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`client-notif-toast-${clientId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "client_notifications", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const n = toClientNotification(payload.new as Parameters<typeof toClientNotification>[0]);
          setToasts((prev) => [n, ...prev].slice(0, MAX_TOASTS));
          setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), TOAST_MS);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  if (toasts.length === 0) return null;

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="toast-in pointer-events-auto flex gap-3 rounded-2xl border border-ink/10 bg-white p-4 shadow-xl"
        >
          {t.kind === "confirmed" ? (
            <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          ) : t.kind === "review_reward" ? (
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          ) : t.kind === "review_request" ? (
            <Star className="mt-0.5 h-5 w-5 shrink-0 fill-gold text-gold" />
          ) : (
            <CalendarX className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {t.kind === "confirmed" ? "Booking confirmed" : t.kind === "cancelled" ? "Your booking was cancelled" : t.title}
            </p>
            <p className="mt-0.5 text-xs text-ink/60">{t.body}</p>
            <Link href={t.linkPath} onClick={() => dismiss(t.id)} className="mt-1 inline-block text-xs font-semibold text-coral-dark hover:underline">
              View
            </Link>
          </div>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="self-start text-ink/40 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
