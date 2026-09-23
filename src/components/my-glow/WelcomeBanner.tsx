import Link from "next/link";
import { Calendar, ClipboardList, Star } from "lucide-react";

const actions = [
  { label: "Book Appointment", href: "/services", icon: Calendar },
  { label: "My Bookings", href: "#services", icon: ClipboardList },
  { label: "My Reviews", href: "#reviews", icon: Star },
];

export default function WelcomeBanner({ firstName }: { firstName: string }) {
  return (
    <div className="rounded-3xl bg-ink p-8 text-white">
      <p className="text-2xl">Welcome back, {firstName}!</p>
      <h1 className="mt-2 text-4xl font-semibold">
        Indulge in <span className="italic text-gold">Beauty &amp; Serenity</span>
      </h1>
      <p className="mt-3 max-w-xl text-white/80">
        Experience premium spa and aesthetic treatments designed to relax
        your mind, refresh your body, and elevate your self-care.
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
