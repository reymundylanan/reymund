import Link from "next/link";
import { Phone } from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/icons/SocialIcons";

const quickLinks = [
  { label: "About Us", href: "/about" },
  { label: "Our Services", href: "/services" },
  { label: "Find a Branch", href: "/branches" },
];
const support = ["FAQs", "Privacy Policy", "Terms of Service", "Submit Feedback"];

export default function Footer() {
  return (
    <footer className="bg-footer text-white/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-lg font-semibold text-white">GlowSync</p>
          <p className="mt-3 text-sm">
            Elevating your wellness journey through synchronized care and
            glowing results.
          </p>
          <span className="mt-4 inline-block rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white">
            Official GCash Partner
          </span>
        </div>

        <div>
          <p className="font-semibold text-white">Quick Links</p>
          <ul className="mt-3 space-y-2 text-sm">
            {quickLinks.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className="hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-semibold text-white">Support</p>
          <ul className="mt-3 space-y-2 text-sm">
            {support.map((link) => (
              <li key={link}>
                <a href="#" className="hover:text-white">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-semibold text-white">Connect With Us</p>
          <p className="mt-3 flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4" /> +63 970 081 0473
          </p>
          <div className="mt-4 flex gap-3">
            <a href="#" aria-label="Facebook" className="hover:text-white">
              <FacebookIcon className="h-5 w-5" />
            </a>
            <a href="#" aria-label="Instagram" className="hover:text-white">
              <InstagramIcon className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-6 py-5 text-center text-xs">
        © 2026 GlowSync. All rights reserved. Payments secured by GCash.
      </div>
    </footer>
  );
}
