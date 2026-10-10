"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LogIn } from "lucide-react";
import GlowMascot from "@/components/GlowMascot";
import { GUIDE_FONTS, TypeText } from "@/components/guide/guideKit";
import { useLoginModal } from "@/components/auth/LoginModalContext";
import { pageHelpFor } from "@/lib/pageHelp";

/** For visitors who aren't signed in (the AI chat is for clients): a small
 * GlowSync AI button that explains what the current page is for and what
 * they can do on it, and invites them to sign in to chat. */
export default function PageHelpButton() {
  const pathname = usePathname() ?? "/";
  const { open: openLogin } = useLoginModal();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const help = pageHelpFor(pathname);

  // Tap outside or press Escape to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className={`fixed bottom-6 right-6 z-[60] flex flex-col items-end ${GUIDE_FONTS}`}>
      {open && (
        <div role="dialog" aria-label={`Help with the ${help.page} page`} className="guide-bubble glowy-pop mb-3 w-[min(22rem,calc(100vw-3rem))] origin-bottom-right">
          <div className="guide-bubble-inner space-y-2.5 p-4">
            <p className="guide-rise flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#a97c1c]">
              <span aria-hidden className="guide-live-dot" />
              GlowSync AI · Help
            </p>
            <p className="guide-rise guide-display guide-title text-[18px] leading-tight">
              {help.page === "this page" ? "What you can do here ✨" : `The ${help.page} page ✨`}
            </p>
            <p className="guide-rise text-[14px] font-semibold leading-relaxed text-ink/85">
              <TypeText key={pathname} text={help.summary} />
            </p>
            <ul className="guide-rise space-y-1.5">
              {help.tips.map((t) => (
                <li key={t.label} className="rounded-2xl bg-[#fff6e6] px-3 py-2 text-[13px] leading-snug text-ink/75 ring-1 ring-[#f1dfb6]">
                  <span className="guide-display font-semibold text-[#a97c1c]">{t.label}</span> — {t.detail}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openLogin();
              }}
              className="guide-rise flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#e9bc4c] to-[#c58d1d] px-3 py-2 text-xs font-extrabold text-white shadow-[0_8px_16px_-8px_rgba(169,124,28,0.8)] transition hover:-translate-y-0.5"
            >
              <LogIn className="h-3.5 w-3.5" /> Log in to ask GlowSync AI anything
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close help" : "What can I do on this page?"}
        className="group relative flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-xl shadow-[#a8843a]/25 ring-2 ring-[#d9b968] transition hover:-translate-y-0.5"
      >
        <span className="glowy-bob flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#fff4d6] to-[#f8e2ef]">
          <GlowMascot size={38} blink />
        </span>
        <span className="text-left leading-tight">
          <span className="block text-[13px] font-extrabold text-ink">Need help?</span>
          <span className="block text-[11px] font-semibold text-[#a97c1c]">What&apos;s on this page</span>
        </span>
      </button>
    </div>
  );
}
