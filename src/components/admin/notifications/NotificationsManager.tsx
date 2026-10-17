"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, History, ImagePlus, Mail, MessageCircle, Send, X } from "lucide-react";
import StatCard from "@/components/StatCard";
import { CARD, CardHeader, FIELD, LABEL } from "./ui";
import { createClient } from "@/lib/supabase/client";
import type { NotificationBroadcast, PromoOption } from "@/lib/supabase/queries/notificationBroadcasts";
import type { DispatchStatus, MessengerResults } from "@/lib/supabase/queries/messenger";

type MessengerInfo = DispatchStatus & {
  configured: boolean;
  missing: string[];
  connected: number;
  reachableNow: number;
};

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function NotificationsManager({
  initialRecipientCount,
  initialHistory,
  between,
  promos,
  messenger,
  messengerResults,
}: {
  initialRecipientCount: number;
  initialHistory: NotificationBroadcast[];
  /** Shown between Compose and the (collapsible) history. */
  between?: ReactNode;
  promos: PromoOption[];
  messenger: MessengerInfo;
  messengerResults: Record<string, MessengerResults>;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [linkTarget, setLinkTarget] = useState<"booking" | "promo">("booking");
  const [promoId, setPromoId] = useState("");
  const [useEmail, setUseEmail] = useState(true);
  const [useMessenger, setUseMessenger] = useState(messenger.configured);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [renderedAt] = useState(() => Date.now());
  // Optional broadcast image (061), uploaded when Send is confirmed.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError("Please choose a JPG, PNG, WebP or GIF image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("That image is too large (max 5 MB).");
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  const channels = [...(useEmail ? ["email"] : []), ...(useMessenger ? ["messenger"] : [])];
  const emailCount = useEmail ? initialRecipientCount : 0;
  const messengerCount = useMessenger ? messenger.connected : 0;
  const linkPath = linkTarget === "promo" ? `/promos/${promoId}` : "/?intent=booking";

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const supabase = createClient();
        const ext = imageFile.type === "image/png" ? "png" : imageFile.type === "image/webp" ? "webp" : imageFile.type === "image/gif" ? "gif" : "jpg";
        const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("broadcast-images").upload(path, imageFile, { contentType: imageFile.type });
        if (uploadError) {
          setError(`Couldn't upload the image: ${uploadError.message}`);
          return;
        }
        imageUrl = supabase.storage.from("broadcast-images").getPublicUrl(path).data.publicUrl;
      }
      const res = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, linkTarget, promoId: linkTarget === "promo" ? promoId : undefined, channels, imageUrl }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        setError(data?.error ?? "Failed to send. Please try again.");
        return;
      }

      const parts: string[] = [];
      if (useEmail) {
        parts.push(
          data.sentCount < data.totalRecipients
            ? `Email sent to ${data.sentCount} of ${data.totalRecipients} — some deliveries failed.`
            : `Email sent to ${plural(data.sentCount, "client")}.`
        );
      }
      if (useMessenger && !data.messengerError) {
        parts.push(`Messenger queued for ${plural(data.messengerQueued, "client")}.`);
      }
      if (data.messengerError) setError(data.messengerError);
      setResult(parts.length > 0 ? parts.join(" ") : null);

      setHistory((prev) => [
        {
          id: data.broadcastId,
          subject,
          message,
          link_path: linkPath,
          recipient_count: data.sentCount,
          created_at: new Date().toISOString(),
          sent_by_name: "You",
          channels,
          image_url: imagePreview,
        },
        ...prev,
      ]);
      setSubject("");
      setMessage("");
      setImageFile(null);
      setImagePreview(null);
    } catch {
      setError("Network error — please check your connection and try again.");
    } finally {
      setSending(false);
      setConfirming(false);
    }
  }

  const canSend =
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    channels.length > 0 &&
    emailCount + messengerCount > 0 &&
    (linkTarget === "booking" || promoId !== "");

  const promoLabel = promos.find((p) => p.id === promoId)?.label;
  const lastSent = history[0];
  const messengerOverdue = !!messenger.oldestPendingAt && renderedAt - new Date(messenger.oldestPendingAt).getTime() > 10 * 60000;
  const missingHint = !subject.trim() ? "Add a subject" : !message.trim() ? "Write your message" : channels.length === 0 ? "Choose Email or Messenger" : emailCount + messengerCount === 0 ? "No one to send to on the chosen channels" : linkTarget === "promo" && !promoId ? "Choose the promo to link" : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Mail} label="Email audience" value={initialRecipientCount} note="Clients who said yes to offers" tint="gold" />
        <StatCard
          icon={MessageCircle}
          label="Messenger"
          value={messenger.configured ? messenger.connected : "Off"}
          note={
            messenger.configured
              ? messengerOverdue
                ? "Messages overdue — check the dispatch cron"
                : `${messenger.reachableNow} reachable now · ${messenger.pendingCount} pending`
              : "Not set up yet"
          }
          tone={messengerOverdue ? "alert" : messenger.configured ? "good" : "default"}
          tint={messenger.configured ? "sage" : "white"}
        />
        <StatCard
          icon={History}
          label="Broadcasts sent"
          value={history.length}
          note={lastSent ? `Last ${formatRelative(lastSent.created_at)}` : "Nothing sent yet"}
          tint="peach"
        />
      </div>

      <section className={CARD}>
        <CardHeader icon={Send} title="Compose Broadcast" subtitle="Write once — it goes out by email and Messenger to clients who opted in." />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            <label className={LABEL}>
              Subject
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. New Autumn Promo!" maxLength={120} className={FIELD} />
            </label>
            <label className={LABEL}>
              <span className="flex items-baseline justify-between">
                Message <span className="text-xs font-normal text-ink/40">{message.length} characters</span>
              </span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="What do you want to tell your clients?" className={`${FIELD} resize-y leading-relaxed`} />
            </label>

            <div>
              <p className={LABEL}>
                Image <span className="font-normal text-ink/40">(optional)</span>
              </p>
              {imagePreview ? (
                <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-[#e8dcc0] p-2">
                  {/* Local preview of the chosen image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Broadcast image preview" className="h-16 w-24 rounded-lg object-cover" />
                  <div className="flex flex-1 flex-wrap gap-2">
                    <label className="cursor-pointer rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:border-coral hover:text-coral-dark">
                      Change
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => { chooseImage(e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                    <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                      <X className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-[#e8dcc0] px-4 py-3.5 text-sm text-ink/60 transition hover:border-coral hover:bg-[#fffaf0]">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f8efd9] text-coral-dark"><ImagePlus className="h-4 w-4" /></span>
                  <span>
                    <span className="block font-medium text-ink/75">Add an image</span>
                    <span className="text-xs text-ink/45">JPG, PNG, WebP or GIF · up to 5 MB</span>
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => { chooseImage(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              )}
              {imagePreview && useMessenger && <p className="mt-1 text-xs text-ink/50">The image goes in the email. Messenger gets the text and button.</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={LABEL}>
                Button opens
                <select value={linkTarget} onChange={(e) => setLinkTarget(e.target.value as "booking" | "promo")} className={FIELD}>
                  <option value="booking">Booking page</option>
                  <option value="promo" disabled={promos.length === 0}>A promo…</option>
                </select>
              </label>
              {linkTarget === "promo" && (
                <label className={LABEL}>
                  Promo
                  <select value={promoId} onChange={(e) => setPromoId(e.target.value)} className={FIELD}>
                    <option value="">Choose a promo</option>
                    {promos.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div>
              <p className={LABEL}>Send by</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <ChannelChip icon={Mail} on={useEmail} onToggle={() => setUseEmail((v) => !v)} label="Email" detail={plural(initialRecipientCount, "client")} />
                <ChannelChip
                  icon={MessageCircle}
                  on={useMessenger}
                  disabled={!messenger.configured}
                  onToggle={() => setUseMessenger((v) => !v)}
                  label="Messenger"
                  detail={messenger.configured ? `${messenger.connected} connected` : "not set up"}
                />
              </div>
              {!messenger.configured && <p className="mt-1.5 text-xs text-ink/45">To turn on Messenger, set {messenger.missing.join(", ")}.</p>}
            </div>
          </div>

          {/* What clients will see */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink/45">Preview</p>
            <div className="overflow-hidden rounded-2xl bg-[#fbf6ea] ring-1 ring-[#efe3c6]">
              <div className="flex items-center gap-2 border-b border-[#efe3c6] bg-white px-4 py-2.5 text-xs text-ink/55">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-coral text-[10px] font-bold text-white">B</span>
                Blush Spa &amp; Aesthetics
              </div>
              <div className="p-4">
                {imagePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="" className="mb-3 max-h-40 w-full rounded-xl object-cover" />
                )}
                <p className="font-semibold leading-snug text-ink">{subject.trim() || <span className="text-ink/30">Your subject</span>}</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/70">
                  {message.trim() || <span className="text-ink/30">Your message to clients appears here.</span>}
                </p>
                <span className="mt-4 inline-block rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white">
                  {linkTarget === "promo" ? (promoLabel ? "View promo" : "Choose a promo") : "Book now"}
                </span>
              </div>
            </div>
          </aside>
        </div>

        {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
        {result && <p className="mt-5 rounded-xl bg-[#E6EDE2] px-4 py-2.5 text-sm text-[#4F6B4A]">{result}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#f1e4c4] pt-5">
          <p className="text-sm text-ink/55">
            {channels.length === 0
              ? "No channel chosen."
              : [useEmail && `Email to ${plural(emailCount, "client")}`, useMessenger && `Messenger to ${messenger.reachableNow} of ${messenger.connected}`].filter(Boolean).join(" · ")}
          </p>
          <div className="flex items-center gap-3">
            {missingHint && <span className="text-xs text-ink/45">{missingHint}</span>}
            <button
              onClick={() => setConfirming(true)}
              disabled={!canSend || sending}
              className="flex items-center gap-2 rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Send className="h-4 w-4" />
              {sending ? "Sending..." : "Send broadcast"}
            </button>
          </div>
        </div>
      </section>

      {/* Other cards (announcement, feedback) sit between Compose and the history. */}
      {between}

      <details className={`group ${CARD} !p-0`}>
        <summary className="cursor-pointer list-none rounded-3xl p-6 transition hover:bg-[#fffaf0] [&::-webkit-details-marker]:hidden">
          <CardHeader
            icon={History}
            title="Broadcast History"
            badge={<span className="rounded-full bg-cream px-2 text-xs font-medium text-ink/55">{history.length}</span>}
            subtitle={lastSent ? `Last sent ${formatRelative(lastSent.created_at)} — ${lastSent.subject}` : "No broadcasts sent yet."}
            right={<ChevronDown className="mt-2 h-5 w-5 shrink-0 text-ink/40 transition-transform group-open:rotate-180" />}
          />
        </summary>
        <ul className="space-y-2 px-6 pb-6">
          {history.length === 0 && <li className="rounded-2xl bg-cream/60 px-4 py-6 text-center text-sm text-ink/50">No broadcasts sent yet.</li>}
          {history.map((h) => {
            const m = messengerResults[h.id];
            return (
              <li key={h.id} className="flex gap-3 rounded-2xl border border-[#f1e4c4] p-3">
                {h.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.image_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#f8efd9] text-coral-dark"><Send className="h-5 w-5" /></span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-ink">{h.subject}</p>
                    <span className="shrink-0 text-xs text-ink/45">{formatRelative(h.created_at)}</span>
                  </div>
                  <p className="text-xs text-ink/50">by {h.sent_by_name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
                    {h.channels.includes("email") && (
                      <span className="flex items-center gap-1 rounded-full bg-[#fbf3dc] px-2 py-0.5 text-[#8A6A1C]">
                        <Mail className="h-3 w-3" /> {plural(h.recipient_count, "recipient")}
                      </span>
                    )}
                    {h.channels.includes("messenger") && (
                      <span className="flex items-center gap-1 rounded-full bg-[#eaf0e5] px-2 py-0.5 text-[#4F6B4A]">
                        <MessageCircle className="h-3 w-3" />
                        {m ? `${m.sent} sent · ${m.skipped} skipped · ${m.failed} failed${m.pending > 0 ? ` · ${m.pending} pending` : ""}` : "none"}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </details>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="font-semibold text-ink">Send this broadcast?</h2>
            <p className="mt-2 text-sm text-ink/60">
              This sends <span className="font-medium text-ink">&ldquo;{subject}&rdquo;</span>
              {useEmail && (
                <>
                  {" "}
                  by email to <span className="font-medium text-ink">{plural(emailCount, "client")}</span>
                </>
              )}
              {useEmail && useMessenger && " and"}
              {useMessenger && (
                <>
                  {" "}
                  by Messenger to <span className="font-medium text-ink">{messenger.reachableNow}</span> of{" "}
                  {messenger.connected} connected clients (the rest are outside Meta&apos;s 24-hour window)
                </>
              )}
              . This can&apos;t be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={sending}
                className="flex-1 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-ink/30 disabled:opacity-50"
              >
                Go back
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? "Sending..." : "Yes, Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Pill toggle for a send channel. */
function ChannelChip({
  icon: Icon,
  on,
  disabled = false,
  onToggle,
  label,
  detail,
}: {
  icon: typeof Mail;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={on}
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${
        on ? "border-coral bg-[#fbf3dc] text-ink" : "border-ink/15 bg-white text-ink/60 hover:border-coral/60"
      }`}
    >
      <span className={`grid h-4 w-4 place-items-center rounded-full border ${on ? "border-coral bg-coral text-white" : "border-ink/25"}`}>
        {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <Icon className="h-4 w-4 text-coral-dark" />
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-ink/50">{detail}</span>
    </button>
  );
}
