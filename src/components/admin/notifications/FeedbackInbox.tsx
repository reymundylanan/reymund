"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isNotMigratedError, logQueryError } from "@/lib/supabase/logQueryError";

type Feedback = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  topic: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

const TOPIC_LABEL: Record<string, string> = {
  general: "General",
  service: "Service",
  booking: "Booking / Payment",
  website: "Website",
  suggestion: "Suggestion",
  complaint: "Complaint",
};

/** Admin → Notifications: messages from the footer's Submit Feedback (062). */
export default function FeedbackInbox() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [showRead, setShowRead] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("site_feedback")
      .select("id, name, email, phone, topic, message, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (isNotMigratedError(error)) setMissing(true);
      else logQueryError("FeedbackInbox", error);
    } else {
      setItems((data ?? []) as Feedback[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const supabase = createClient();
    const channel = supabase
      .channel(`site-feedback-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "site_feedback" }, () => load())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function toggleRead(f: Feedback) {
    const next = f.read_at ? null : new Date().toISOString();
    setItems((prev) => prev.map((x) => (x.id === f.id ? { ...x, read_at: next } : x)));
    const { error } = await createClient().from("site_feedback").update({ read_at: next }).eq("id", f.id);
    if (error) {
      logQueryError("FeedbackInbox toggle", error);
      load();
    }
  }

  const unread = items.filter((f) => !f.read_at).length;
  const shown = showRead ? items : items.filter((f) => !f.read_at);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Inbox className="h-5 w-5 text-coral-dark" /> Client Feedback
          {unread > 0 && <span className="rounded-full bg-coral px-2 py-0.5 text-xs font-semibold text-white">{unread} new</span>}
        </h2>
        <label className="flex items-center gap-2 text-sm text-ink/60">
          <input type="checkbox" checked={showRead} onChange={(e) => setShowRead(e.target.checked)} /> Show read
        </label>
      </div>
      <p className="mt-1 text-sm text-ink/50">Messages sent from the website&apos;s Submit Feedback page.</p>

      <div className="mt-4 divide-y divide-ink/5">
        {loading ? (
          <p className="py-3 text-sm text-ink/50">Loading…</p>
        ) : missing ? (
          <p className="py-3 text-sm text-amber-700">Apply migration 062 to start receiving feedback.</p>
        ) : shown.length === 0 ? (
          <p className="py-3 text-sm text-ink/50">{items.length ? "No unread feedback." : "No feedback yet."}</p>
        ) : (
          shown.map((f) => (
            <div key={f.id} className={`py-4 ${f.read_at ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {f.name}{" "}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.topic === "complaint" ? "bg-red-50 text-red-600" : "bg-skin text-coral-dark"}`}>
                    {TOPIC_LABEL[f.topic] ?? f.topic}
                  </span>
                </p>
                <span className="text-xs text-ink/45">
                  {new Date(f.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink/80">{f.message}</p>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink/55">
                {f.email && (
                  <a href={`mailto:${f.email}`} className="flex items-center gap-1 hover:text-coral-dark">
                    <Mail className="h-3.5 w-3.5" /> {f.email}
                  </a>
                )}
                {f.phone && (
                  <a href={`tel:${f.phone.replace(/\s/g, "")}`} className="flex items-center gap-1 hover:text-coral-dark">
                    <Phone className="h-3.5 w-3.5" /> {f.phone}
                  </a>
                )}
                <button type="button" onClick={() => toggleRead(f)} className="font-semibold text-coral-dark hover:underline">
                  {f.read_at ? "Mark unread" : "Mark as read"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
