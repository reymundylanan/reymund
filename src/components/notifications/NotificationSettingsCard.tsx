"use client";

import { useEffect, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logQueryError } from "@/lib/supabase/logQueryError";
import ChannelHeader from "@/components/notifications/ChannelHeader";

/** Email notices on/off (sent through the spa's Gmail) and an optional
 * Messenger chat link. Shown on My Glow, appointment pages and My Profile
 * (#notifications). */
export default function NotificationSettingsCard({
  userId,
  email,
  messengerUsername,
}: {
  userId: string;
  email: string | null;
  messengerUsername: string | null;
}) {
  const [emailOn, setEmailOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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

  const on = emailOn && !!email;

  return (
    <div id="notifications" className="flex h-full scroll-mt-24 flex-col rounded-3xl border border-rose/60 bg-white p-4">
      <ChannelHeader
        variant="email"
        title="Email Updates"
        subtitle="Booking confirmations, reminders and changes in your Gmail."
        status={on ? { label: "On", tone: "on" } : { label: "Off", tone: "off" }}
      />

      <div className="mt-4 space-y-4 px-1">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-cream/70 p-3">
          <input
            type="checkbox"
            checked={emailOn}
            disabled={!email}
            onChange={(e) => toggleEmail(e.target.checked)}
            className="mt-1 h-4 w-4 accent-coral"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Mail className="h-4 w-4 text-coral-dark" /> Send me email updates
            </span>
            <span className="block break-all text-xs text-ink/55">
              {email ? `Sent to ${email}` : "No email on your account."}
            </span>
          </span>
        </label>

        <p className="text-xs leading-relaxed text-ink/55">
          You&apos;ll get an email when your booking is confirmed, rescheduled or cancelled, a reminder the day before, and a
          request to rate your visit afterwards.
        </p>

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
