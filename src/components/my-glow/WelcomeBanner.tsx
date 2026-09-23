import Link from "next/link";
import { Calendar, ClipboardList, Gift, Star } from "lucide-react";

const actions = [
  { label: "Book Appointment", href: "/services", icon: Calendar },
  { label: "My Bookings", href: "#services", icon: ClipboardList },
  { label: "My Reviews", href: "#reviews", icon: Star },
  { label: "My Rewards", href: "#rewards", icon: Gift },
];

export default function WelcomeBanner({ firstName }: { firstName: string }) {
  return (
    <div className="rounded-3xl bg-ink p-8 text-white">
      <p className="text-lg">Welcome back, {firstName}! 👋</p>
      <h1 className="mt-2 text-4xl font-semibold">
        Indulge in <span className="italic text-gold">Absolute Serenity</span>
      </h1>
      <p className="mt-3 max-w-xl text-white/80">
        Rejuvenate your mind, body, and soul with our curated selection of
        luxury spa treatments.
      </p>

      <div className="mt-6 flex flex-wrap gap-6">
        {actions.map(({ label, href, icon: Icon }) => (
          <Link key={label} href={href} className="flex flex-col items-center gap-2 text-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Icon className="h-5 w-5" />
            </span>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
