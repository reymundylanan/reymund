import { Bell, Mail, MessageCircle } from "lucide-react";
import GlowMascot from "@/components/GlowMascot";

/** Shared header for the My Glow "how we reach you" cards: an illustrated
 * badge (envelope or Messenger-style bubble) with GlowSync's mascot. */
export default function ChannelHeader({
  variant,
  title,
  subtitle,
  status,
}: {
  variant: "email" | "messenger";
  title: string;
  subtitle: string;
  status?: { label: string; tone: "on" | "off" | "paused" } | null;
}) {
  const messenger = variant === "messenger";
  return (
    <div
      className={`relative overflow-hidden rounded-2xl px-4 py-4 ${
        messenger ? "bg-gradient-to-br from-[#eef4ff] via-[#f6efff] to-[#fff0f4]" : "bg-gradient-to-br from-cream via-[#fbf1dc] to-[#f6e3b8]"
      }`}
    >
      {/* Soft sparkles behind the badge. */}
      <span aria-hidden className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/50 blur-xl" />
      <div className="relative flex items-center gap-3">
        <span className="relative shrink-0">
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md ${
              messenger
                ? "bg-gradient-to-br from-[#0a7cff] via-[#a033ff] to-[#ff5c87] shadow-[#a033ff]/30"
                : "bg-gradient-to-br from-[#f3d98b] via-[#d4af37] to-[#a8843a] shadow-[#a8843a]/30"
            }`}
          >
            {messenger ? <MessageCircle className="h-6 w-6" strokeWidth={2.2} /> : <Mail className="h-6 w-6" strokeWidth={2.2} />}
          </span>
          {!messenger && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-coral-dark shadow-sm">
              <Bell className="h-3 w-3" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold text-ink">{title}</span>
            {status && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  status.tone === "on"
                    ? "bg-[#e8f5e9] text-[#2e7d32]"
                    : status.tone === "paused"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-white/70 text-ink/50"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${status.tone === "on" ? "bg-[#3fae5a]" : status.tone === "paused" ? "bg-amber-500" : "bg-ink/30"}`} />
                {status.label}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-sm text-ink/60">{subtitle}</span>
        </span>
        <span aria-hidden className="glowy-bob hidden shrink-0 sm:block">
          <GlowMascot size={44} />
        </span>
      </div>
    </div>
  );
}
