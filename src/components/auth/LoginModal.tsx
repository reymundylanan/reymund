"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import LoginCard from "@/components/auth/LoginCard";
import StaffLoginForm from "@/components/auth/StaffLoginForm";

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [offers, setOffers] = useState(false);
  // Shown when someone tries to log in before ticking the Terms box.
  const [nudge, setNudge] = useState(false);

  /** Every login option checks this first: no login until the Terms are accepted. */
  function requireAgreement() {
    if (agreed) return true;
    setNudge(true);
    document.getElementById("login-agreement")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="scrollbar-hidden max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="relative bg-blush px-8 py-8 text-center">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 text-ink/40 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
          <p className="text-2xl font-semibold text-coral-dark">BLUSH</p>
          <h1 className="mt-3 text-2xl font-semibold text-ink">Login</h1>
          <p className="mt-2 text-sm text-ink/60">
            Continue with Google or Facebook to book and manage your
            appointments. New here? This creates your account automatically.
          </p>
        </div>

        <div className="px-8 py-8">
          <StaffLoginForm onSuccess={onClose} canProceed={requireAgreement} offers={offers} />

          <div className="my-6 flex items-center gap-3 text-xs text-ink/40">
            <span className="h-px flex-1 bg-ink/15" />
            OR
            <span className="h-px flex-1 bg-ink/15" />
          </div>

          <LoginCard canProceed={requireAgreement} offers={offers} />

          <div
            id="login-agreement"
            className={`mt-6 space-y-2 rounded-2xl p-3 text-xs text-ink/60 transition ${
              nudge && !agreed ? "bg-red-50 ring-1 ring-red-300" : ""
            }`}
          >
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  if (e.target.checked) setNudge(false);
                }}
                aria-invalid={nudge && !agreed}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink/20 accent-coral"
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="font-medium text-coral-dark underline-offset-2 hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="font-medium text-coral-dark underline-offset-2 hover:underline">
                  Privacy Policy
                </Link>
                . <span className="text-red-500">*</span>
              </span>
            </label>
            {nudge && !agreed && (
              <p role="alert" className="pl-6 font-medium text-red-600">
                Please agree to the Terms of Service and Privacy Policy to log in.
              </p>
            )}
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={offers}
                onChange={(e) => setOffers(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink/20 accent-coral"
              />
              <span>I&apos;d like to receive exclusive offers and beauty trends from GlowSync. (optional)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
