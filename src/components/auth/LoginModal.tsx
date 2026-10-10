"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import LoginCard from "@/components/auth/LoginCard";
import StaffLoginForm from "@/components/auth/StaffLoginForm";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const [offers, setOffers] = useState(false);
  // "Forgot password?" swaps the login options for the reset form.
  const [forgot, setForgot] = useState(false);

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
          {forgot ? (
            <ForgotPasswordForm onBack={() => setForgot(false)} />
          ) : (
            <>
              <StaffLoginForm onSuccess={onClose} offers={offers} onForgot={() => setForgot(true)} />

              <div className="my-6 flex items-center gap-3 text-xs text-ink/40">
                <span className="h-px flex-1 bg-ink/15" />
                OR
                <span className="h-px flex-1 bg-ink/15" />
              </div>

              <LoginCard offers={offers} />

              <div className="mt-6 space-y-3 px-3 text-xs text-ink/60">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={offers}
                    onChange={(e) => setOffers(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink/20 accent-coral"
                  />
                  <span>I&apos;d like to receive exclusive offers and beauty trends from GlowSync. (optional)</span>
                </label>
                <p className="text-center text-ink/45">
                  By continuing, you agree to our{" "}
                  <Link href="/terms" target="_blank" className="font-medium text-coral-dark underline-offset-2 hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="font-medium text-coral-dark underline-offset-2 hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
