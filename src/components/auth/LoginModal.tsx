"use client";

import { X } from "lucide-react";
import LoginCard from "@/components/auth/LoginCard";
import StaffLoginForm from "@/components/auth/StaffLoginForm";

export default function LoginModal({ onClose }: { onClose: () => void }) {
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
          <p className="text-2xl font-semibold text-coral-dark">GlowSync</p>
          <h1 className="mt-3 text-2xl font-semibold text-ink">Login</h1>
          <p className="mt-2 text-sm text-ink/60">
            Continue with Google or Facebook to book and manage your
            appointments. New here? This creates your account automatically.
          </p>
        </div>

        <div className="px-8 py-8">
          <StaffLoginForm onSuccess={onClose} />

          <div className="my-6 flex items-center gap-3 text-xs text-ink/40">
            <span className="h-px flex-1 bg-ink/15" />
            OR
            <span className="h-px flex-1 bg-ink/15" />
          </div>

          <LoginCard />
        </div>
      </div>
    </div>
  );
}
