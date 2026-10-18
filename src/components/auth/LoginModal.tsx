"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import LoginCard from "@/components/auth/LoginCard";
import StaffLoginForm from "@/components/auth/StaffLoginForm";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";


export default function LoginModal({ onClose, notice = null }: { onClose: () => void; notice?: string | null }) {
  const [offers, setOffers] = useState(false);
  // "Forgot password?" swaps the login options for the reset form.
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2b1a10]/45 px-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        className="scrollbar-hidden relative max-h-[92vh] w-full max-w-[26rem] overflow-y-auto rounded-[2rem] bg-white shadow-[0_30px_80px_-30px_rgba(43,26,16,0.6)] ring-1 ring-[#efe3c6]"
      >
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-ink/40 transition hover:bg-white hover:text-ink">
          <X className="h-5 w-5" />
        </button>

        <div className="relative overflow-hidden bg-gradient-to-b from-[#fbf3dc] to-[#fffaf0] px-8 pb-6 pt-8 text-center">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-champagne/40 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-coral/15 blur-2xl" />
          <Image src="/images/logo/cropblushicon2.png" alt="Blush Spa & Aesthetics" width={64} height={64} className="relative mx-auto h-16 w-16 rounded-full bg-white object-contain p-1.5 shadow-sm ring-1 ring-champagne" priority />
          <h1 id="login-title" className="relative mt-4 font-display text-[1.7rem] font-semibold leading-tight text-ink">
            {forgot ? "Reset password" : "Welcome back"}
          </h1>
          {!forgot && (
            <p className="relative mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink/60">
              Log in to book and manage your appointments. New here? Continue with Google or Facebook — your account is created automatically.
            </p>
          )}
        </div>

        <div className="px-8 pb-7 pt-5">
          {notice && (
            <p role="alert" className="mb-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {notice}
            </p>
          )}

          {forgot ? (
            <ForgotPasswordForm onBack={() => setForgot(false)} />
          ) : (
            <>
              {/* Staff, admins and anyone with a username */}
              <StaffLoginForm onSuccess={onClose} offers={offers} onForgot={() => setForgot(true)} />

              <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/40">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#e8dcc0]" />
                or continue with
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#e8dcc0]" />
              </div>

              {/* Clients */}
              <LoginCard offers={offers} />

              <div className="mt-6 space-y-3 border-t border-[#f1e4c4] pt-5 text-xs text-ink/60">
                <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={offers}
                      onChange={(e) => setOffers(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink/20 accent-coral"
                    />
                    <span>Send me exclusive offers and beauty trends from GlowSync. (optional)</span>
                  </label>
                <p className="text-center leading-relaxed text-ink/45">
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
