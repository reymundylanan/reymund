import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/icons/SocialIcons";
import { SPA_EMAIL, SPA_PHONE } from "@/components/InfoPage";

const quickLinks = [
  { label: "About Us", href: "/about" },
  { label: "Our Services", href: "/services" },
  { label: "Find a Branch", href: "/branches" },
];

const support = [
  { label: "FAQs", href: "/faq" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Submit Feedback", href: "/feedback" },
];

// The spa's pages; NEXT_PUBLIC_FACEBOOK_URL / NEXT_PUBLIC_INSTAGRAM_URL can override.
const pageUsername = process.env.NEXT_PUBLIC_MESSENGER_PAGE_USERNAME?.trim();
const facebookUrl = process.env.NEXT_PUBLIC_FACEBOOK_URL?.trim() || "https://www.facebook.com/blushspaxaesthetics";
const messengerUrl = pageUsername ? `https://m.me/${pageUsername}` : "";
const instagramUrl = process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim() || "https://www.instagram.com/blushspaxaesthetics_onececilia/";

export default function Footer() {
  return (
    <footer className="bg-footer text-white/75">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-2xl font-semibold text-white">GlowSync</p>
          <p className="mt-3 text-sm leading-relaxed">
            Elevating your wellness journey through synchronized care and glowing results.
          </p>
          <span className="mt-4 inline-block rounded-full border border-champagne/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-champagne">
            Official GCash Partner
          </span>
        </div>

        <div>
          <p className="font-semibold text-white">Quick Links</p>
          <ul className="mt-3 space-y-2 text-sm">
            {quickLinks.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className="transition hover:text-champagne">
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
              <li key={link.label}>
                <Link href={link.href} className="transition hover:text-champagne">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-semibold text-white">Connect With Us</p>
          <a href={`tel:${SPA_PHONE.replace(/\s/g, "")}`} className="mt-3 flex items-center gap-2 text-sm transition hover:text-champagne">
            <Phone className="h-4 w-4" /> {SPA_PHONE}
          </a>
          <a href={`mailto:${SPA_EMAIL}`} className="mt-2 flex items-center gap-2 break-all text-sm transition hover:text-champagne">
            <Mail className="h-4 w-4 shrink-0" /> {SPA_EMAIL}
          </a>
          <div className="mt-4 flex gap-3">
            {facebookUrl && (
              <a href={facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="rounded-full bg-white/10 p-2 transition hover:bg-coral hover:text-white">
                <FacebookIcon className="h-5 w-5" />
              </a>
            )}
            {messengerUrl && (
              <a href={messengerUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat on Messenger" className="rounded-full bg-white/10 p-2 transition hover:bg-coral hover:text-white">
                <MessageCircle className="h-5 w-5" />
              </a>
            )}
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="rounded-full bg-white/10 p-2 transition hover:bg-coral hover:text-white">
                <InstagramIcon className="h-5 w-5" />
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-6 py-5 text-center text-xs text-white/60">
        © {new Date().getFullYear()} Blush Spa &amp; Aesthetics · GlowSync. All rights reserved. Payments secured by GCash.
      </div>
    </footer>
  );
}
