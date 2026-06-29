"use client";

import { useState } from "react";
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
import type { Client } from "@/lib/frontdeskData";

const tabs = ["Service History", "Preferences & Notes", "Communications"];

export default function ClientProfile({ client }: { client: Client }) {
  const [tab, setTab] = useState(tabs[0]);

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
            <p className="mt-1 flex items-center gap-1 text-sm text-ink/60">
              <MapPin className="h-3.5 w-3.5" /> {client.address}
            </p>
            <p className="mt-1 flex items-center gap-4 text-sm text-ink/60">
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {client.email}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {client.phone}
              </span>
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
          <p className="mt-1 font-semibold text-ink">{client.totalSpend}</p>
        </div>
        <div>
          <p className="text-xs text-ink/50">Loyalty Points</p>
          <p className="mt-1 font-semibold text-ink">{client.loyaltyPoints}</p>
        </div>
        <div>
          <p className="text-xs text-ink/50">Visits This Year</p>
          <p className="mt-1 font-semibold text-ink">{client.visitsThisYear}</p>
        </div>
        <div>
          <p className="text-xs text-ink/50">Last Visit Date</p>
          <p className="mt-1 font-semibold text-ink">{client.lastVisit}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-gold/15 p-4">
        <div className="flex items-center gap-3">
          <Gift className="h-5 w-5 text-coral-dark" />
          <div>
            <p className="text-sm font-medium text-ink">
              {client.loyaltyPoints} Points Available
            </p>
            <p className="text-xs text-ink/60">
              {client.name.split(" ")[0]} is only {client.pointsToReward} points
              away from a FREE Signature Massage!
            </p>
          </div>
        </div>
        <button className="rounded-full bg-coral px-4 py-2 text-xs font-semibold text-white hover:bg-coral-dark">
          Redeem Points
        </button>
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
              {client.serviceHistory.map((s, i) => (
                <tr key={i} className="border-t border-ink/5">
                  <td className="py-3 text-ink/60">{s.date}</td>
                  <td className="py-3 font-medium text-ink">{s.service}</td>
                  <td className="py-3 text-ink/60">{s.therapist}</td>
                  <td className="py-3 text-ink/60">{s.price}</td>
                  <td className="py-3">
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                      {s.status}
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
              <span className="text-ink/60">{client.allergy}</span>
            </p>
            <p className="text-ink/70">&ldquo;{client.preferences}&rdquo;</p>
          </div>
        )}

        {tab === "Communications" && (
          <div className="space-y-4">
            <p className="text-sm text-ink/60">
              Notifications Sent Today: 8 schedule changes notified via App.
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
