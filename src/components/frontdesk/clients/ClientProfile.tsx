"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Flag,
  Gift,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getClientServiceHistory,
  type ClientServiceHistoryItem,
  type FrontDeskClient,
} from "@/lib/supabase/queries/frontdeskClients";
import { getTierProgress } from "@/lib/myGlowTiers";

const tabs = ["Service History", "Preferences & Notes", "Communications"];

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

export default function ClientProfile({ client }: { client: FrontDeskClient }) {
  const [tab, setTab] = useState(tabs[0]);
  const [history, setHistory] = useState<ClientServiceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const supabase = createClient();
    getClientServiceHistory(supabase, client.id).then((rows) => {
      setHistory(rows);
      setLoading(false);
    });
  }, [client.id]);

  const completed = history.filter((h) => h.status === "completed");
  const visitsThisYear = completed.filter(
    (h) => new Date(h.date).getFullYear() === new Date().getFullYear()
  ).length;
  const lastVisit = completed[0]?.date ?? "—";
  const tier = getTierProgress(client.loyaltyPoints);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blush text-ink/40">
            <User className="h-7 w-7" />
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
            <p className="mt-1 text-xs text-ink/40">
              Member since {client.memberSince} &bull; GDPR:{" "}
              {client.gdprConsented ? "Consented" : "Not Consented"}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            Edit Profile
          </button>
          <button className="rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
            Book Service
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-ink/10 pt-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-ink/50">Total Lifetime Spend</p>
          <p className="mt-1 font-semibold text-ink">₱{client.totalSpend.toLocaleString()}</p>
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

        {tab === "Communications" && (
          <div className="space-y-4">
            <p className="text-sm text-ink/60">
              Communication tools for this client will appear here.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-xs font-medium text-ink/70 hover:border-coral">
                <Send className="h-3.5 w-3.5" /> Send Promotional SMS
              </button>
              <button className="flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-xs font-medium text-ink/70 hover:border-coral">
                <MessageSquare className="h-3.5 w-3.5" /> Log Feedback Survey
              </button>
              <button className="flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
                <Flag className="h-3.5 w-3.5" /> Flag for Deactivation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
