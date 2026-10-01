"use client";

import { useEffect, useState } from "react";
import { QrCode, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getGcashSettings, saveGcashSettings } from "@/lib/supabase/queries/payNow";
import { formatGcashNumber, isValidGcashNumber, receiptFileError } from "@/lib/payNow";

/** Admin → Payments: the GCash name, number and QR that clients see when
 * they choose Pay Now (059). */
export default function GcashSettingsCard() {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGcashSettings(createClient()).then((s) => {
      if (cancelled) return;
      setName(s.accountName);
      setNumber(s.number ? formatGcashNumber(s.number) : "");
      setQrUrl(s.qrUrl);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (qrPreview) URL.revokeObjectURL(qrPreview);
    };
  }, [qrPreview]);

  async function save() {
    setMessage(null);
    if (!name.trim()) return setMessage({ ok: false, text: "Enter the GCash account name." });
    if (!isValidGcashNumber(number)) return setMessage({ ok: false, text: "Enter a valid 11-digit GCash number (09XX XXX XXXX)." });
    setSaving(true);
    const { error } = await saveGcashSettings(createClient(), {
      accountName: name,
      number: formatGcashNumber(number).replace(/\s/g, ""),
      qrFile,
    });
    setSaving(false);
    if (error) return setMessage({ ok: false, text: error });
    if (qrPreview) setQrUrl(qrPreview);
    setQrFile(null);
    setMessage({ ok: true, text: "Saved. Clients will see these details on Pay Now." });
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Smartphone className="h-4 w-4" />
        </span>
        GCash Settings (Pay Now)
      </h2>
      <p className="mt-1 text-xs text-ink/50">Shown to clients who choose Pay Now when booking.</p>

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <label className="block text-xs font-medium text-ink/60">
            GCash Account Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              disabled={!loaded}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink outline-none focus:border-coral"
            />
          </label>
          <label className="block text-xs font-medium text-ink/60">
            GCash Number
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value.slice(0, 16))}
              onBlur={() => setNumber((n) => formatGcashNumber(n))}
              placeholder="09XX XXX XXXX"
              disabled={!loaded}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 font-mono text-sm text-ink outline-none focus:border-coral"
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-coral">
            <QrCode className="h-4 w-4" /> {qrUrl || qrPreview ? "Change QR Code" : "Upload QR Code"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const problem = receiptFileError(file);
                if (problem) return setMessage({ ok: false, text: problem.replace("GCash receipt", "QR code") });
                setQrFile(file);
                setQrPreview(URL.createObjectURL(file));
              }}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !loaded}
              className="rounded-full bg-coral px-5 py-2 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save GCash Settings"}
            </button>
            {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-ink/10 bg-blush/30 p-3">
          {qrPreview || qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrPreview ?? qrUrl ?? ""} alt="GCash QR code" className="h-44 w-44 object-contain" />
          ) : (
            <p className="flex h-44 w-44 items-center justify-center text-center text-xs text-ink/40">No QR code yet</p>
          )}
          <p className="mt-1 text-[11px] text-ink/40">{qrFile ? "New QR — click Save" : "Current QR"}</p>
        </div>
      </div>
    </div>
  );
}
