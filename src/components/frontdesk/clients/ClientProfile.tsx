"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BadgeCheck,
  Gift,
  Mail,
  MapPin,
  Phone,
  Star,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getClientServiceHistory,
  setClientVip,
  type ClientServiceHistoryItem,
  type FrontDeskClient,
} from "@/lib/supabase/queries/frontdeskClients";
import { getTierProgress } from "@/lib/myGlowTiers";
import { GENDER_OPTIONS } from "@/lib/profileValidation";
import { formatVisitDate, statsFromVisits } from "@/lib/clientDirectory";

const tabs = ["Service History", "Preferences & Notes"];

const statusStyles: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  confirmed: "bg-amber-100 text-amber-700",
  pending: "bg-amber-100 text-amber-700",
  checked_in: "bg-blue-100 text-blue-700",
  in_service: "bg-blue-100 text-blue-700",
  no_show: "bg-red-100 text-red-600",
  conflict: "bg-red-100 text-red-600",
  cancelled: "bg-red-100 text-red-600",
};

export default function ClientProfile({
  client,
  onVipChange,
}: {
  client: FrontDeskClient;
  onVipChange: (isVip: boolean) => void;
}) {
  const [tab, setTab] = useState(tabs[0]);
  const [history, setHistory] = useState<ClientServiceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [vipUpdating, setVipUpdating] = useState(false);
  const [vipError, setVipError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const supabase = createClient();
    getClientServiceHistory(supabase, client.id).then((rows) => {
      setHistory(rows);
      setLoading(false);
    });
  }, [client.id]);

  async function handleToggleVip() {
    setVipUpdating(true);
    setVipError(null);
    const supabase = createClient();
    const { error } = await setClientVip(supabase, client.id, !client.vip);
    setVipUpdating(false);
    if (error) {
      setVipError(error);
      return;
    }
    onVipChange(!client.vip);
  }

  // All-branch totals come from 058; before it, count what this desk can see.
  const fallback = statsFromVisits(history.map((h) => ({ scheduledDate: h.dateKey, completed: h.completed })));
  const visitsThisYear = client.statsAvailable ? client.visitsThisYear : fallback.visitsThisYear;
  const lastVisit = formatVisitDate(client.statsAvailable ? client.lastVisit : fallback.lastVisit);
  const totalSpend = client.totalSpend;
  const tier = getTierProgress(client.loyaltyPoints);
  const genderLabel = GENDER_OPTIONS.find((g) => g.value === client.gender)?.label ?? null;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-blush text-xl font-semibold text-coral-dark">
            {client.avatarUrl ? (
              <Image src={client.avatarUrl} alt="" fill sizes="64px" className="object-cover" />
            ) : client.name ? (
              client.name.charAt(0)
            ) : (
              <User className="h-7 w-7 text-ink/40" />
            )}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{client.name}</h2>
              {client.vip && (
                <span className="flex items-center gap-1 rounded-full bg-gold/30 px-2 py-0.5 text-xs font-semibold text-coral-dark">
                  <BadgeCheck className="h-3.5 w-3.5" /> VIP
                </span>
              )}
            </div>
            {client.branchName && (
              <p className="mt-1 flex items-center gap-1 text-sm text-ink/60">
                <MapPin className="h-3.5 w-3.5" /> {client.branchName}
              </p>
            )}
            <p className="mt-1 flex items-center gap-4 text-sm text-ink/60">
              {client.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {client.email}
                </span>
              )}
              {client.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {client.phone}
                </span>
              )}
            </p>
            {(genderLabel || client.address) && (
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/60">
                {genderLabel && (
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> {genderLabel}
                  </span>
                )}
                {client.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {client.address}
                  </span>
                )}
              </p>
            )}
            <p className="mt-1 text-xs text-ink/40">
              Member since {client.memberSince} &bull; GDPR:{" "}
              {client.gdprConsented ? "Consented" : "Not Consented"}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleToggleVip}
            disabled={vipUpdating}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              client.vip
                ? "border border-ink/15 text-ink/70 hover:border-coral"
                : "bg-coral text-white hover:bg-coral-dark"
            }`}
          >
            <Star className="h-4 w-4" />
            {vipUpdating
              ? "Updating…"
              : client.vip
                ? "Remove VIP"
                : "Make VIP"}
          </button>
          {vipError && <p className="text-xs text-red-600">{vipError}</p>}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-ink/10 pt-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-ink/50">Total Lifetime Spend</p>
          <p className="mt-1 font-semibold text-ink">₱{totalSpend.toLocaleString("en-PH", { maximumFractionDigits: 2 })}</p>
          {client.statsAvailable && client.totalVisits > 0 && (
            <p className="text-[11px] text-ink/40">
              {client.totalVisits} {client.totalVisits === 1 ? "visit" : "visits"} total
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-ink/50">Loyalty Points</p>
          <p className="mt-1 font-semibold text-ink">{client.loyaltyPoints.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-ink/50">Visits This Year</p>
          <p className="mt-1 font-semibold text-ink">{visitsThisYear}</p>
        </div>
        <div>
          <p className="text-xs text-ink/50">Last Visit Date</p>
          <p className="mt-1 font-semibold text-ink">{lastVisit}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-gold/15 p-4">
        <div className="flex items-center gap-3">
          <Gift className="h-5 w-5 text-coral-dark" />
          <div>
            <p className="text-sm font-medium text-ink">
              {tier.tier} Member &bull; {client.loyaltyPoints.toLocaleString()} Glow Points
            </p>
            <p className="text-xs text-ink/60">
              {tier.nextTier
                ? `${client.name.split(" ")[0]} is ${tier.pointsToNext} points away from ${tier.nextTier} tier.`
                : `${client.name.split(" ")[0]} has reached the top tier.`}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-2 border-b border-ink/10">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-coral text-coral-dark" : "text-ink/40"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Service History" && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-ink/40">
                <th className="py-2">Date</th>
                <th className="py-2">Service</th>
                <th className="py-2">Therapist</th>
                <th className="py-2">Price</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink/40">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && history.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink/40">
                    No bookings yet.
                  </td>
                </tr>
              )}
              {history.map((s) => (
                <tr key={s.id} className="border-t border-ink/5">
                  <td className="py-3 text-ink/60">{s.date}</td>
                  <td className="py-3 font-medium text-ink">{s.service}</td>
                  <td className="py-3 text-ink/60">{s.therapist ?? "—"}</td>
                  <td className="py-3 text-ink/60">{s.price}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        statusStyles[s.status] ?? "bg-ink/10 text-ink/50"
                      }`}
                    >
                      {s.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "Preferences & Notes" && (
          <div className="space-y-3 text-sm">
            <p>
              <span className="font-medium text-ink">Allergy:</span>{" "}
              <span className="text-ink/60">{client.allergy ?? "None recorded"}</span>
            </p>
            <p className="text-ink/70">
              {client.preferences ? `“${client.preferences}”` : "No preferences recorded."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
