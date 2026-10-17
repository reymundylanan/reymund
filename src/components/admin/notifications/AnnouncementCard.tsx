"use client";

import { useEffect, useState } from "react";
import { Megaphone, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CARD, CardHeader, FIELD, LABEL, Switch } from "./ui";
import { getAnnouncement, safeAnnouncementLink, saveAnnouncement, type Announcement } from "@/lib/supabase/queries/publicContent";


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
    <section className={CARD}>
      <CardHeader
        icon={Megaphone}
        title="Website Announcement"
        subtitle="The gold bar at the top of every page of the website."
        right={
          a && (
            <label className="flex items-center gap-2.5 text-sm font-medium text-ink/70">
              {a.enabled ? "Showing" : "Hidden"}
              <Switch checked={a.enabled} onChange={(v) => { setA({ ...a, enabled: v }); setMsg(null); }} label="Show the announcement bar" />
            </label>
          )
        }
      />

      {!a ? (
        <p className="mt-5 text-sm text-ink/50">Loading…</p>
      ) : (
        <div className="mt-5 space-y-4">
          <label className={LABEL}>
            <span className="flex items-baseline justify-between">
              Text <span className="text-xs font-normal text-ink/40">{a.text.length}/200</span>
            </span>
            <input value={a.text} onChange={(e) => { setA({ ...a, text: e.target.value.slice(0, 200) }); setMsg(null); }} className={FIELD} placeholder="e.g. 20% off all facials this week!" />
          </label>
          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <label className={LABEL}>
              Link <span className="font-normal text-ink/40">(optional)</span>
              <input value={a.link ?? ""} onChange={(e) => { setA({ ...a, link: e.target.value }); setMsg(null); }} className={FIELD} placeholder="/#promotions or https://…" />
            </label>
            <label className={LABEL}>
              Link text
              <input value={a.linkLabel ?? ""} onChange={(e) => setA({ ...a, linkLabel: e.target.value.slice(0, 30) })} className={FIELD} placeholder="Learn More" />
            </label>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink/45">
              Preview {!a.enabled && <span className="normal-case tracking-normal text-ink/40">— hidden on the website</span>}
            </p>
            <div className={`rounded-xl bg-coral px-4 py-2.5 text-center text-sm text-white transition ${a.enabled ? "" : "opacity-40 grayscale-[30%]"}`}>
              <span className="inline-flex flex-wrap items-center justify-center gap-x-2">
                <Sparkles className="h-4 w-4" /> {a.text.trim() || "Your announcement text"}
                {safeAnnouncementLink(a.link) && <span className="font-semibold underline">{a.linkLabel || "Learn More"}</span>}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[#f1e4c4] pt-4">
            <button type="button" onClick={save} disabled={saving} className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-coral-dark disabled:opacity-50">
              {saving ? "Saving…" : "Save announcement"}
            </button>
            {msg && <p className={`text-sm ${msg.ok ? "text-[#4F6B4A]" : "text-red-600"}`}>{msg.text}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
