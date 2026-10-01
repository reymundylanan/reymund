"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, ChevronRight, Link2, Mail, Plus, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { searchClientAccounts } from "@/lib/supabase/queries/walkins";
import { memberSinceLabel, phoneHint, providerLabel, type ClientMatch } from "@/lib/walkinLinking";

export function ClientAvatar({ match, size = "h-10 w-10" }: { match: ClientMatch; size?: string }) {
  return (
    <span
      className={`relative flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-sm font-bold text-coral-dark`}
    >
      {match.avatarUrl ? (
        <Image src={match.avatarUrl} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        match.fullName.charAt(0).toUpperCase()
      )}
    </span>
  );
}

function ProviderBadge({ match }: { match: ClientMatch }) {
  const tone =
    match.provider === "facebook"
      ? "bg-blue-50 text-blue-700"
      : match.provider === "google"
        ? "bg-amber-50 text-amber-700"
        : "bg-green-50 text-green-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{providerLabel(match.provider)}</span>;
}

const LINK_BENEFITS = [
  "Connect the walk-in service to their account",
  "Add it to their service history",
  "Allow them to write a review",
  "Enable reward eligibility (if applicable)",
];

/** "Client Found" confirmation — Front Desk must confirm before linking. */
export function ClientFoundDialog({
  match,
  onCancel,
  onLink,
}: {
  match: ClientMatch;
  onCancel: () => void;
  onLink: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const phone = phoneHint(match.phoneLast4);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-found-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="client-found-title" className="font-semibold text-ink">
            Client Found
          </h3>
          <button onClick={onCancel} aria-label="Close" className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-ink/10 p-3">
          <ClientAvatar match={match} size="h-14 w-14" />
          <div className="min-w-0">
            <p className="font-semibold text-ink">{match.fullName}</p>
            <p className="text-xs text-ink/50">{match.emailMasked ?? "No email on file"}</p>
            <span className="mt-1 inline-block rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
              Existing Client Account
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 rounded-xl border border-ink/10 p-2.5">
            <Mail className="h-4 w-4 text-ink/40" />
            <div className="min-w-0">
              <p className="text-ink/40">{phone ? "Mobile" : "Email"}</p>
              <p className="truncate text-ink">{phone ?? match.emailMasked ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-ink/10 p-2.5">
            <UserRound className="h-4 w-4 text-ink/40" />
            <div>
              <p className="text-ink/40">Account Type</p>
              <p className="text-ink">{providerLabel(match.provider)}</p>
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink/40">{memberSinceLabel(match.memberSince)}</p>

        <div className="mt-4 rounded-xl bg-blush/50 p-3">
          <p className="text-xs font-semibold text-ink/70">Linking this client will:</p>
          <ul className="mt-2 space-y-1.5">
            {LINK_BENEFITS.map((b) => (
              <li key={b} className="flex items-center gap-2 text-xs text-ink/70">
                <Check className="h-3.5 w-3.5 text-green-600" /> {b}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-3 text-xs text-ink/50">Please confirm with the client that this is their account.</p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-ink/15 py-2 text-sm text-ink/60 hover:border-ink/30"
          >
            Cancel
          </button>
          <button
            onClick={onLink}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-pink-500 py-2 text-sm font-semibold text-white hover:bg-pink-600"
          >
            <Link2 className="h-4 w-4" /> Link Client
          </button>
        </div>
      </div>
    </div>
  );
}

/** Client Full Name field that also searches existing client accounts. */
export default function ClientAccountSearch({
  name,
  onNameChange,
  linked,
  onLink,
  onUnlink,
}: {
  name: string;
  onNameChange: (v: string) => void;
  linked: ClientMatch | null;
  onLink: (m: ClientMatch) => void;
  onUnlink: () => void;
}) {
  const [results, setResults] = useState<ClientMatch[] | null>(null);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">("idle");
  // Before migration 054 the search doesn't exist: behave like the old plain field.
  const [unavailable, setUnavailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState<ClientMatch | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (linked || unavailable) return;
    const q = name.trim();
    const id = ++requestId.current;
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      setSearchState("loading");
      const res = await searchClientAccounts(createClient(), q);
      if (id !== requestId.current) return;
      if (res.status === "ok") {
        setResults(res.matches);
        setSearchState("idle");
      } else {
        setResults(null);
        setSearchState(res.status === "error" ? "error" : "idle");
        if (res.status === "unavailable") setUnavailable(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [name, linked, unavailable]);

  if (linked) {
    return (
      <div>
        <label className="text-xs font-medium text-ink/60">Client</label>
        <div className="mt-1 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50/40 p-2.5">
          <ClientAvatar match={linked} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{linked.fullName}</p>
            <p className="truncate text-xs text-ink/50">{linked.emailMasked ?? providerLabel(linked.provider)}</p>
          </div>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Linked Account</span>
          <button onClick={onUnlink} aria-label="Unlink client account" className="text-ink/40 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const showResults = !unavailable && !dismissed && results !== null && name.trim().length >= 2;

  return (
    <div>
      <label htmlFor="walkin-client-name" className="text-xs font-medium text-ink/60">
        Client Full Name
      </label>
      <input
        id="walkin-client-name"
        value={name}
        onChange={(e) => {
          setDismissed(false);
          onNameChange(e.target.value);
        }}
        placeholder={unavailable ? "e.g. Sofia Vergara" : "Type a name to find an existing account"}
        autoComplete="off"
        className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
      />
      {searchState === "loading" && <p className="mt-1 text-xs text-ink/40">Searching client accounts…</p>}
      {searchState === "error" && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          Couldn&apos;t search client accounts. You can still register the walk-in.
        </p>
      )}

      {showResults && (
        <div className="mt-2 overflow-hidden rounded-xl border border-ink/10">
          {results.length > 0 ? (
            <>
              <p className="bg-ink/[0.03] px-3 py-1.5 text-[11px] font-medium text-ink/50">
                Search Results ({results.length})
              </p>
              <ul>
                {results.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => setPending(m)}
                      className="flex w-full items-center gap-3 border-t border-ink/5 px-3 py-2 text-left hover:bg-blush/40"
                    >
                      <ClientAvatar match={m} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{m.fullName}</p>
                        <p className="truncate text-xs text-ink/50">
                          {[m.emailMasked ?? "No email on file", phoneHint(m.phoneLast4)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                          Existing Client Account
                        </span>
                        <ProviderBadge match={m} />
                      </div>
                      <ChevronRight className="h-4 w-4 text-ink/30" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="px-3 py-2 text-xs text-ink/60">No Existing Client Account Found</p>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="flex w-full items-center gap-2 border-t border-ink/10 px-3 py-2 text-left text-xs font-semibold text-pink-600 hover:bg-pink-50"
          >
            <Plus className="h-4 w-4" /> Register New Walk-In Customer
          </button>
        </div>
      )}

      {pending && (
        <ClientFoundDialog
          match={pending}
          onCancel={() => setPending(null)}
          onLink={() => {
            onLink(pending);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
