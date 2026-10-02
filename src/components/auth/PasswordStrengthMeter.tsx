"use client";

import { Check, X } from "lucide-react";
import { passwordChecks, passwordStrength } from "@/lib/passwordStrength";

// Red → orange → amber → lime → green, by score 0–4.
const COLORS = ["#d64545", "#e8833a", "#e0b53a", "#8bbf3f", "#2e9e4f"];

/** Live strength bar and the list of rules, for any new-password field. */
export default function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  const color = COLORS[score];
  const checks = passwordChecks(password);

  return (
    <div className="mt-2 space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full transition-colors duration-300"
              style={{ backgroundColor: password && i <= score ? color : "rgb(59 42 31 / 0.1)" }}
            />
          ))}
        </div>
        <span className="w-16 text-right text-xs font-semibold" style={{ color: password ? color : "rgb(59 42 31 / 0.4)" }}>
          {password ? label : ""}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.key} className={`flex items-center gap-1.5 ${c.ok ? "text-[#2e7d32]" : "text-ink/45"}`}>
            {c.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Passwords match" / "don't match" under a confirm field. */
export function PasswordMatchHint({ password, confirm }: { password: string; confirm: string }) {
  if (!confirm) return null;
  const match = password === confirm;
  return (
    <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${match ? "text-[#2e7d32]" : "text-red-600"}`}>
      {match ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      {match ? "Passwords match" : "Passwords don't match"}
    </p>
  );
}
