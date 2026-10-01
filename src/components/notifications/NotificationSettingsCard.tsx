"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { currentPushSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/notifications/pushClient";
import { logQueryError } from "@/lib/supabase/logQueryError";

/** Phone/browser push, email notices and a Messenger chat link. Shown on
 * My Glow, appointment pages and My Profile (#notifications). */
export default function NotificationSettingsCard({
  userId,
  email,
  messengerUsername,
}: {
  userId: string;
  email: string | null;
  messengerUsername: string | null;
}) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [emailOn, setEmailOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const s = pushSupport();
    setSupport(s);
    if (s === "supported" && Notification.permission === "granted") {
      currentPushSubscription()
        .then((sub) => !cancelled && setPushOn(Boolean(sub)))
        .catch(() => {});
    }
    createClient()
      .from("notification_preferences")
      .select("email_enabled")
      .eq("profile_id", userId)
      .maybeSingle()
      .then(({ data, error: prefsError }) => {
        logQueryError("NotificationSettingsCard prefs", prefsError);
        if (!cancelled && data) setEmailOn(data.email_enabled);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function togglePush() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const err = pushOn ? await disablePush(supabase) : await enablePush(supabase);
      if (err) setError(err);
      else setPushOn(!pushOn);
    } catch (e) {
      console.error("push toggle failed:", e);
      setError("Couldn't change phone notifications on this device. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEmail(next: boolean) {
    setEmailOn(next);
    setError(null);
    const { error: saveError } = await createClient()
      .from("notification_preferences")
      .upsert({ profile_id: userId, email_enabled: next, updated_at: new Date().toISOString() });
    if (saveError) {
      logQueryError("NotificationSettingsCard save", saveError);
      setEmailOn(!next);
      setError("Couldn't save your email setting. Please try again.");
    }
  }

  return (
    <div id="notifications" className="scroll-mt-24 rounded-3xl border border-rose/60 bg-white p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <Bell className="h-5 w-5 text-coral-dark" /> Notifications
      </h3>
      <p className="mt-1 text-sm text-ink/60">Get booking confirmations, reminders and changes.</p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-ink">Phone notifications</p>
          {support === "supported" && (
            <>
              <p className="text-xs text-ink/50">
                {pushOn ? "On for this device ✓" : "Pop-up alerts on this phone or computer, even when the site is closed."}
              </p>
              <button
                type="button"
                onClick={togglePush}
                disabled={busy}
                className={
                  pushOn
                    ? "mt-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
                    : "mt-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
                }
              >
                {busy ? "Please wait…" : pushOn ? "Turn off" : "Turn on"}
              </button>
            </>
          )}
          {support === "needs_home_screen" && (
            <p className="text-xs text-ink/50">
              On iPhone: tap the Share button <span aria-hidden>⎋</span>, choose <strong>Add to Home Screen</strong>, open
              GlowSync from your home screen, then come back here to turn notifications on.
            </p>
          )}
          {support === "unsupported" && (
            <p className="text-xs text-ink/50">This browser doesn&apos;t support notifications. Try Chrome, Edge or Safari.</p>
          )}
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={emailOn}
            disabled={!email}
            onChange={(e) => toggleEmail(e.target.checked)}
            className="mt-1 h-4 w-4 accent-coral"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Mail className="h-4 w-4 text-ink/40" /> Email updates
            </span>
            <span className="block break-all text-xs text-ink/50">
              {email ? `Sent to ${email}` : "No email on your account."}
            </span>
          </span>
        </label>

        {messengerUsername && (
          <a
            href={`https://m.me/${encodeURIComponent(messengerUsername)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-semibold text-coral-dark hover:underline"
          >
            <MessageCircle className="h-4 w-4" /> Questions? Chat with us on Messenger
          </a>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
