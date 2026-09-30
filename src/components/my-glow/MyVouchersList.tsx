"use client";

import { useEffect, useRef, useState } from "react";
import { expiryLabel, peso } from "@/lib/vouchers";
import { sortVouchers, type Voucher } from "@/lib/supabase/queries/vouchers";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
}

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-full border border-coral/40 px-3 py-1 text-xs font-semibold text-coral-dark hover:bg-blush"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function inactiveNote(v: Voucher): string {
  if (v.status === "used") {
    const when = v.usedAt ? `Used ${formatDate(v.usedAt)}` : "Used";
    return v.discountApplied !== null ? `${when} · −${peso(v.discountApplied)}` : when;
  }
  if (v.status === "expired") return `Expired ${formatDate(v.expiresAt)} — points returned`;
  return "Cancelled — points returned";
}

export default function MyVouchersList({ vouchers }: { vouchers: Voucher[] }) {
  if (vouchers.length === 0) return null;
  const sorted = sortVouchers(vouchers);

  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-ink">My Vouchers</h4>
      <ul className="mt-2 space-y-2">
        {sorted.map((v) => {
          if (v.status !== "active") {
            return (
              <li key={v.id} className="rounded-2xl border border-ink/10 bg-ink/5 px-3 py-2 text-ink/50">
                <p className="text-sm font-medium">{v.name}</p>
                <p className="font-mono text-xs tracking-wider">{v.code}</p>
                <p className="text-xs">{inactiveNote(v)}</p>
              </li>
            );
          }
          const expiry = expiryLabel(v.expiresAt);
          return (
            <li key={v.id} className="rounded-2xl border border-rose/60 bg-blush/40 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{v.name}</p>
                  <p className="font-mono text-sm tracking-wider text-ink">{v.code}</p>
                  <p className={`text-xs ${expiry.soon ? "font-medium text-amber-600" : "text-ink/60"}`}>{expiry.text}</p>
                </div>
                <CopyCodeButton code={v.code} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
