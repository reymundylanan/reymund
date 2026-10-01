"use client";

import { useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

const TOPICS = [
  { value: "general", label: "General" },
  { value: "service", label: "A treatment / service" },
  { value: "booking", label: "Booking or payment" },
  { value: "website", label: "This website" },
  { value: "suggestion", label: "Suggestion" },
  { value: "complaint", label: "Complaint" },
];

const field = "mt-1 w-full rounded-xl border border-nude bg-white px-4 py-2.5 text-ink outline-none focus:border-coral focus:ring-2 focus:ring-coral/20";

/** Footer → Submit Feedback. Saved to site_feedback (062); Admin reads it. */
export default function FeedbackForm() {
  const { user } = useCurrentUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState("general");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const shownName = name || user?.fullName || "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!shownName.trim()) return setError("Please enter your name.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Please enter a valid email, or leave it blank.");
    if (message.trim().length < 5) return setError("Please write a little more in your message.");
    setSending(true);
    const { error: insertError } = await createClient()
      .from("site_feedback")
      .insert({
        client_id: user?.role === "customer" ? user.id : null,
        name: shownName.trim().slice(0, 80),
        email: email.trim() || null,
        phone: phone.trim() || null,
        topic,
        message: message.trim().slice(0, 2000),
      });
    setSending(false);
    if (insertError) {
      console.error("feedback insert failed:", insertError);
      return setError("We couldn't send your message right now. Please try again, or contact us by phone or email.");
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-3xl border border-nude/70 bg-white p-10 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h2 className="mt-4 text-2xl font-semibold text-ink">Thank you!</h2>
        <p className="mt-2 text-ink/70">Your message has been sent to our team. We read every one.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-nude/70 bg-white p-6 shadow-sm sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink/80">
          Name <span className="text-red-500">*</span>
          <input value={shownName} onChange={(e) => setName(e.target.value.slice(0, 80))} className={field} autoComplete="name" />
        </label>
        <label className="text-sm font-medium text-ink/80">
          Topic
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className={field}>
            {TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-ink/80">
          Email <span className="text-ink/45">(optional)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 120))} className={field} autoComplete="email" />
        </label>
        <label className="text-sm font-medium text-ink/80">
          Phone <span className="text-ink/45">(optional)</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 30))} className={field} autoComplete="tel" />
        </label>
      </div>
      <label className="block text-sm font-medium text-ink/80">
        Message <span className="text-red-500">*</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
          rows={6}
          placeholder="Tell us what you think — compliments, ideas or anything we can do better."
          className={field}
        />
        <span className="mt-1 block text-right text-xs text-ink/45">{message.length}/2000</span>
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="inline-flex items-center gap-2 rounded-full bg-coral px-6 py-3 text-sm font-semibold text-white transition hover:bg-coral-dark disabled:opacity-50"
      >
        <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send Feedback"}
      </button>
    </form>
  );
}
