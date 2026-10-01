"use client";

import { useEffect, useState } from "react";
import { Megaphone, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAnnouncement, safeAnnouncementLink, saveAnnouncement, type Announcement } from "@/lib/supabase/queries/publicContent";

const field = "mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral";

/** Admin → Notifications: edit the gold announcement bar on the website. */
export default function AnnouncementCard() {
  const [a, setA] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAnnouncement(createClient()).then((x) => !cancelled && setA(x));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!a) return;
    setMsg(null);
    if (a.enabled && !a.text.trim()) return setMsg({ ok: false, text: "Write the announcement text, or turn the bar off." });
    if (a.link && !safeAnnouncementLink(a.link)) return setMsg({ ok: false, text: "The link must start with / (a page on this site) or https://." });
    setSaving(true);
    const { error } = await saveAnnouncement(createClient(), a);
    setSaving(false);
    setMsg(error ? { ok: false, text: error } : { ok: true, text: "Saved — the website shows it on the next page load." });
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <Megaphone className="h-5 w-5 text-coral-dark" /> Website Announcement
      </h2>
      <p className="mt-1 text-sm text-ink/50">The gold bar at the top of every page of the website.</p>

      {!a ? (
        <p className="mt-4 text-sm text-ink/50">Loading…</p>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-ink/80">
            <input type="checkbox" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} className="h-4 w-4 accent-coral" />
            Show the announcement bar
          </label>
          <label className="block text-sm font-medium text-ink/70">
            Text
            <input value={a.text} onChange={(e) => setA({ ...a, text: e.target.value.slice(0, 200) })} className={field} placeholder="e.g. 20% off all facials this week!" />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <label className="block text-sm font-medium text-ink/70">
              Link <span className="font-normal text-ink/40">(optional)</span>
              <input value={a.link ?? ""} onChange={(e) => setA({ ...a, link: e.target.value })} className={field} placeholder="/#promotions or https://…" />
            </label>
            <label className="block text-sm font-medium text-ink/70">
              Link text
              <input value={a.linkLabel ?? ""} onChange={(e) => setA({ ...a, linkLabel: e.target.value.slice(0, 30) })} className={field} placeholder="Learn More" />
            </label>
          </div>

          {a.enabled && a.text.trim() && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/50">Preview</p>
              <div className="rounded-lg bg-coral px-4 py-2 text-center text-sm text-white">
                <span className="inline-flex flex-wrap items-center justify-center gap-x-2">
                  <Sparkles className="h-4 w-4" /> {a.text}
                  {safeAnnouncementLink(a.link) && <span className="font-semibold underline">{a.linkLabel || "Learn More"}</span>}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving} className="rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50">
              {saving ? "Saving…" : "Save Announcement"}
            </button>
            {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
