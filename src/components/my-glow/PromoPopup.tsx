"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dismissPromo, type ClientPromo } from "@/lib/supabase/queries/promos";
import { getServiceImage } from "@/lib/serviceImage";

export default function PromoPopup({ clientId, promo }: { clientId: string; promo: ClientPromo }) {
  const [open, setOpen] = useState(true);

  function close() {
    setOpen(false);
    dismissPromo(createClient(), clientId, promo.id);
  }

  if (!open) return null;

  const image = getServiceImage(promo.category ?? promo.department ?? promo.title);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <button
          onClick={close}
          aria-label="Dismiss"
          className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-ink/60 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="absolute left-4 top-4 z-10 rounded-full bg-coral px-3 py-1 text-xs font-semibold text-white">
          Special Promo
        </span>

        <div className="relative h-48 w-full">
          <Image src={image} alt={promo.title} fill className="object-cover" />
          {promo.badge && (
            <span className="absolute bottom-3 right-3 flex h-14 w-14 items-center justify-center rounded-full bg-coral text-center text-xs font-bold leading-tight text-white shadow">
              {promo.badge}
            </span>
          )}
        </div>

        <div className="p-6">
          <h2 className="text-xl font-semibold text-ink">{promo.title}</h2>
          {promo.description && <p className="mt-2 text-sm text-ink/60">{promo.description}</p>}
          <div className="mt-3 space-y-1 text-xs text-ink/50">
            {promo.validUntil && (
              <p>Valid until {new Date(promo.validUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
            )}
            <p>{promo.branchName}</p>
          </div>
          <Link
            href={`/promos/${promo.id}`}
            onClick={close}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white hover:bg-coral-dark"
          >
            View Details &amp; Book
          </Link>
        </div>
      </div>
    </div>
  );
}
