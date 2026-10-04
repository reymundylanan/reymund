"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessengerStatus } from "@/lib/supabase/queries/messenger";
import ChannelHeader from "@/components/notifications/ChannelHeader";

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
    <div className="flex h-full flex-col rounded-3xl border border-rose/60 bg-white p-4">
      <ChannelHeader
        variant="messenger"
        title="Messenger Updates"
        subtitle="Reminders and updates in your Messenger chat."
        status={
          status === "connected"
            ? { label: "Connected", tone: "on" }
            : status === "paused"
              ? { label: "Paused", tone: "paused" }
              : { label: "Not connected", tone: "off" }
        }
      />

      {/* A peek at what arrives in Messenger. */}
      <div aria-hidden className="mt-4 space-y-1.5 px-1">
        <div className="flex items-end gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0a7cff] via-[#a033ff] to-[#ff5c87] text-[9px] font-bold text-white">B</span>
          <span className="rounded-2xl rounded-bl-sm bg-[#f0f0f3] px-3 py-1.5 text-xs text-ink/75">Hi! Your facial is tomorrow at 9:30 AM ✨</span>
        </div>
        <div className="flex justify-end">
          <span className="rounded-2xl rounded-br-sm bg-gradient-to-r from-[#0a7cff] to-[#a033ff] px-3 py-1.5 text-xs text-white">See you there! 💕</span>
        </div>
      </div>
      <div className="mt-auto px-1 pt-2">

      {status === "connected" && (
        <>
          <p className="mt-1 text-sm text-ink/60">Reminders and updates will arrive in Messenger.</p>
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
    </div>
  );
}
