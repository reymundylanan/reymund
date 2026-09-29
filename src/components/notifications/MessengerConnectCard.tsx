"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { MessengerStatus } from "@/lib/supabase/queries/messenger";

const POLL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

export default function MessengerConnectCard({
  userId,
  initialStatus,
}: {
  userId: string;
  initialStatus: MessengerStatus;
}) {
  const [status, setStatus] = useState<MessengerStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After opening Messenger, watch for the webhook to create our row.
  useEffect(() => {
    if (!waiting) return;
    const supabase = createClient();
    const started = Date.now();
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("messenger_subscriptions")
        .select("opted_out_at")
        .eq("profile_id", userId)
        .maybeSingle();
      if (data) {
        setStatus(data.opted_out_at ? "paused" : "connected");
        setWaiting(false);
      } else if (Date.now() - started > POLL_TIMEOUT_MS) {
        setWaiting(false);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, userId]);

  async function connect() {
    setBusy(true);
    setError(null);
    // Open the tab synchronously so popup blockers allow it, then point it at m.me.
    const tab = window.open("", "_blank");
    try {
      const res = await fetch("/api/messenger/link-token", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        tab?.close();
        setError(data?.error ?? "Couldn't start Messenger connect. Please try again.");
        return;
      }
      if (tab) tab.location.href = data.url;
      else window.location.href = data.url;
      setWaiting(true);
    } catch {
      tab?.close();
      setError("Network error — please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await createClient().from("messenger_subscriptions").delete().eq("profile_id", userId);
    setBusy(false);
    if (deleteError) setError("Couldn't disconnect. Please try again.");
    else setStatus("none");
  }

  return (
    <div className="rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <MessageCircle className="h-5 w-5 text-coral-dark" /> Messenger Updates
      </h3>

      {status === "connected" && (
        <>
          <p className="mt-1 text-sm text-ink/60">Connected ✓ — reminders and updates will arrive in Messenger.</p>
          <button
            onClick={disconnect}
            disabled={busy}
            className="mt-3 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
          >
            Disconnect
          </button>
        </>
      )}

      {status === "paused" && (
        <>
          <p className="mt-1 text-sm text-ink/60">Paused — type START in Messenger to resume.</p>
          <button
            onClick={disconnect}
            disabled={busy}
            className="mt-3 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
          >
            Disconnect
          </button>
        </>
      )}

      {status === "none" && (
        <>
          <p className="mt-1 text-sm text-ink/60">Get appointment reminders and updates on Messenger.</p>
          <button
            onClick={connect}
            disabled={busy || waiting}
            className="mt-3 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
          >
            {waiting ? "Waiting for Messenger…" : "Connect Messenger"}
          </button>
          {waiting && (
            <p className="mt-2 text-xs text-ink/50">Tap &ldquo;Get Started&rdquo; in Messenger to finish connecting.</p>
          )}
        </>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
