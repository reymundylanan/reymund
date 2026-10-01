"use client";

import { useEffect, useState } from "react";
import { QrCode, Smartphone, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getGcashSettings, saveBranchGcashSettings } from "@/lib/supabase/queries/payNow";
import { formatGcashNumber, isValidGcashNumber, receiptFileError } from "@/lib/payNow";

const INCOMPLETE = "Please complete the GCash payment information before enabling Pay Now.";

/** Admin → Branches → branch → Payment Settings (060): this branch's GCash
 * details and Pay Now switch. Other branches are unaffected. */
export default function BranchPaymentSettings({ branchId, branchName }: { branchId: string; branchName: string }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [qrPath, setQrPath] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [payNow, setPayNow] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGcashSettings(createClient(), branchId).then((s) => {
      if (cancelled) return;
      setName(s.accountName);
      setNumber(s.number ? formatGcashNumber(s.number) : "");
      setQrPath(s.qrPath);
      setQrUrl(s.qrUrl);
      setPayNow(s.payNowEnabled);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  useEffect(() => {
    return () => {
      if (qrPreview) URL.revokeObjectURL(qrPreview);
    };
  }, [qrPreview]);

  const shownQr = qrPreview ?? (removeQr ? null : qrUrl);
  const hasQr = !!shownQr;

  async function save() {
    setMessage(null);
    const numberFilled = number.trim() !== "";
    if (numberFilled && !isValidGcashNumber(number)) {
      return setMessage({ ok: false, text: "Enter a valid 11-digit GCash number (09XX XXX XXXX)." });
    }
    if (payNow && (!name.trim() || !numberFilled || !hasQr)) return setMessage({ ok: false, text: INCOMPLETE });
    setSaving(true);
    const { error, qrPath: savedPath } = await saveBranchGcashSettings(createClient(), branchId, {
      accountName: name,
      number: numberFilled ? formatGcashNumber(number).replace(/\s/g, "") : "",
      qrFile,
      removeQr,
      payNowEnabled: payNow,
      currentQrPath: qrPath,
    });
    setSaving(false);
    if (error) return setMessage({ ok: false, text: error });
    setQrPath(savedPath);
    if (qrPreview) setQrUrl(qrPreview);
    else if (removeQr) setQrUrl(null);
    setQrFile(null);
    setRemoveQr(false);
    setMessage({ ok: true, text: `Saved for ${branchName}.` });
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Smartphone className="h-4 w-4" />
        </span>
        Payment Settings
      </h2>
      <p className="mt-1 text-sm text-ink/50">GCash details clients see when they choose Pay Now at {branchName}.</p>

      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <p className="text-sm font-semibold text-ink">GCash Payment Information</p>
          <label className="block text-sm font-medium text-ink/60">
            GCash Account Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              placeholder={`Blush Spa – ${branchName}`}
              disabled={!loaded}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-base text-ink outline-none focus:border-coral"
            />
          </label>
          <label className="block text-sm font-medium text-ink/60">
            GCash Number
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value.slice(0, 16))}
              onBlur={() => setNumber((n) => (n.trim() ? formatGcashNumber(n) : ""))}
              placeholder="09XX XXX XXXX"
              disabled={!loaded}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 font-mono text-base text-ink outline-none focus:border-coral"
            />
          </label>

          <div className="rounded-xl border border-ink/10 p-4">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-semibold text-ink">Enable Pay Now for this branch</span>
                <span className="block text-xs text-ink/50">Clients can pay by GCash when booking at {branchName}.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={payNow}
                disabled={!loaded}
                onChange={(e) => setPayNow(e.target.checked)}
                className="h-5 w-5 accent-coral"
              />
            </label>
          </div>

          <div className="rounded-xl bg-blush/50 p-4 text-sm">
            <p className="font-semibold text-ink">Advance Payment</p>
            <p className="mt-1 text-ink/60">
              Pay Now collects the <span className="font-medium text-ink">full booking total</span> (the services&apos;
              prices). There is no separate deposit amount.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !loaded}
              className="rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Payment Settings"}
            </button>
            {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-semibold text-ink">GCash QR Code</p>
          <div className="flex h-56 w-56 items-center justify-center rounded-xl border border-ink/10 bg-blush/30 p-3">
            {shownQr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownQr} alt={`GCash QR code for ${branchName}`} className="h-full w-full object-contain" />
            ) : (
              <p className="text-center text-xs text-ink/40">No QR code yet</p>
            )}
          </div>
          {qrFile && <p className="text-[11px] text-ink/40">New QR — click Save</p>}
          {removeQr && !qrFile && <p className="text-[11px] text-red-600">QR will be removed — click Save</p>}
          <div className="flex gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:border-coral">
              <QrCode className="h-4 w-4" /> {hasQr ? "Change QR Code" : "Upload QR Code"}
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
                  setRemoveQr(false);
                  setQrPreview(URL.createObjectURL(file));
                }}
              />
            </label>
            {hasQr && (
              <button
                type="button"
                onClick={() => {
                  setQrFile(null);
                  setQrPreview(null);
                  setRemoveQr(true);
                  setPayNow(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" /> Remove QR Code
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
