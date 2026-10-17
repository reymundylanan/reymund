"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, Inbox, Mail, Phone } from "lucide-react";
import { CARD, CardHeader } from "./ui";
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
    <section className={CARD}>
      <CardHeader
        icon={Inbox}
        title="Client Feedback"
        subtitle="Messages sent from the website's Submit Feedback page."
        badge={unread > 0 && <span className="rounded-full bg-coral px-2 py-0.5 text-xs font-semibold text-white">{unread} new</span>}
        right={
          <div role="tablist" aria-label="Show" className="flex rounded-full bg-cream p-1 text-sm">
            {([[false, `Unread${unread ? ` (${unread})` : ""}`], [true, `All (${items.length})`]] as const).map(([v, label]) => (
              <button
                key={label}
                role="tab"
                aria-selected={showRead === v}
                onClick={() => setShowRead(v)}
                className={`rounded-full px-3.5 py-1.5 font-semibold transition ${showRead === v ? "bg-white text-ink shadow-sm" : "text-ink/50 hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-ink/50">Loading…</p>
        ) : missing ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Apply migration 062 to start receiving feedback.</p>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-cream/60 px-4 py-8 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-coral-dark shadow-sm"><CheckCheck className="h-5 w-5" /></span>
            <p className="text-sm font-medium text-ink/70">{items.length ? "All caught up — no unread feedback." : "No feedback yet."}</p>
            {items.length > 0 && !showRead && (
              <button type="button" onClick={() => setShowRead(true)} className="text-xs font-semibold text-coral-dark hover:underline">
                See all {items.length}
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((f) => (
              <li key={f.id} className={`rounded-2xl border p-4 transition ${f.read_at ? "border-ink/10 bg-white opacity-75" : "border-[#efd9a6] bg-[#fffaf0]"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f8efd9] text-sm font-semibold text-coral-dark">
                      {f.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <div>
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                        {f.name}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.topic === "complaint" ? "bg-red-50 text-red-600" : "bg-[#fbf3dc] text-[#8A6A1C]"}`}>
                          {TOPIC_LABEL[f.topic] ?? f.topic}
                        </span>
                      </p>
                      <p className="text-xs text-ink/45">
                        {new Date(f.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRead(f)}
                    className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-ink/65 hover:border-coral hover:text-coral-dark"
                  >
                    {f.read_at ? "Mark unread" : "Mark as read"}
                  </button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{f.message}</p>
                {(f.email || f.phone) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {f.email && (
                      <a href={`mailto:${f.email}`} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-ink/65 ring-1 ring-ink/10 hover:text-coral-dark">
                        <Mail className="h-3.5 w-3.5" /> {f.email}
                      </a>
                    )}
                    {f.phone && (
                      <a href={`tel:${f.phone.replace(/\s/g, "")}`} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-ink/65 ring-1 ring-ink/10 hover:text-coral-dark">
                        <Phone className="h-3.5 w-3.5" /> {f.phone}
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
