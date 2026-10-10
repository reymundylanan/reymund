"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Car, Check, CheckCircle2, Clock, MapPin, Phone, Search, Sparkles, UserRound, X } from "lucide-react";
import type { OptionView } from "@/lib/multiBranch/walkinServer";
import type { HairSize, WalkinService } from "@/lib/multiBranch/walkin";

type Catalog = { name: string; department: string; category: string; duration: number; sizes: string[]; branches: { branchId: string; branchName: string; price: number }[] };
type SearchResult = {
  originBranchId: string;
  today: string;
  origin: { ok: boolean; reason: string | null };
  branches: { branchId: string; branchName: string; ok: boolean; reason: string | null }[];
  options: OptionView[];
};

const peso = (n: number) => `₱${Math.round(n).toLocaleString()}`;
const fmt = (m: number) => {
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const dayLabel = (d: string, today: string) => {
  if (d === today) return "Today";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};
const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(json.error ?? "Something went wrong."), { data: json });
  return json;
}

/**
 * The walk-in's service can't be done here (not offered, or nobody free):
 * search every branch, explain the best options to the client, and book the
 * one they agree to. The receiving branch checks them in when they arrive.
 */
export default function WalkinTransferModal({
  clientName,
  clientPhone,
  clientId,
  initialServices,
  initialDuration,
  originPrice,
  preferredStaffId,
  transferId,
  onClose,
  onBooked,
}: {
  clientName: string;
  clientPhone: string | null;
  clientId: string | null;
  /** From the registration form; empty = pick from every branch's services. */
  initialServices: WalkinService[];
  initialDuration: number;
  originPrice: number | null;
  preferredStaffId?: string | null;
  /** Resuming a saved request (awaiting approval / waiting). */
  transferId?: string | null;
  onClose: () => void;
  onBooked: (message: string) => void;
}) {
  const [name, setName] = useState(clientName);
  const [phone, setPhone] = useState(clientPhone ?? "");
  const [services, setServices] = useState<WalkinService[]>(initialServices);
  const [duration, setDuration] = useState(initialDuration);
  const [catalog, setCatalog] = useState<Catalog[] | null>(null);
  const [pick, setPick] = useState("");
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState(nowHHMM());
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<OptionView | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(transferId ?? null);
  const [booked, setBooked] = useState<{ code: string; option: OptionView } | null>(null);

  // Services from every branch (to add one this branch doesn't offer).
  useEffect(() => {
    let alive = true;
    fetch("/api/walkin-transfer/catalog")
      .then((r) => r.json())
      .then((j: { services?: Catalog[] }) => alive && setCatalog(j.services ?? []))
      .catch(() => alive && setCatalog([]));
    return () => {
      alive = false;
    };
  }, []);

  const search = useCallback(async () => {
    if (services.length === 0) return;
    setSearching(true);
    setError(null);
    setChosen(null);
    setAgreed(false);
    try {
      const r = await post<SearchResult>("/api/walkin-transfer/search", {
        services,
        duration,
        preferredStaffId,
        date,
        time: date === todayKey() ? time : time || null,
        days: 3,
      });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    }
    setSearching(false);
  }, [services, duration, preferredStaffId, date, time]);

  // Search straight away with what the form already has.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first automatic search
    if (initialServices.length) search();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, []);

  const elsewhere = useMemo(() => (result?.options ?? []).filter((o) => o.branchId !== result?.originBranchId), [result]);
  const here = useMemo(() => (result?.options ?? []).filter((o) => o.branchId === result?.originBranchId), [result]);
  const now = elsewhere.filter((o) => o.immediate);
  const later = elsewhere.filter((o) => !o.immediate);

  function addService(n: string) {
    const c = catalog?.find((x) => x.name === n);
    if (!c || services.some((s) => s.name === c.name)) return;
    const next = [...services, { name: c.name, size: (c.sizes[0] as HairSize | undefined) ?? null, price: null }];
    setServices(next);
    setDuration((d) => (services.length === 0 ? c.duration : d + c.duration));
    setPick("");
  }

  async function confirm() {
    if (!chosen) return;
    setSaving(true);
    setError(null);
    try {
      const r = await post<{ booking_code: string }>("/api/walkin-transfer/confirm", {
        transferId: savedId,
        clientId,
        walkinName: name,
        walkinPhone: phone || null,
        services,
        duration,
        originPrice,
        date,
        time,
        preferredStaffId,
        clientAgreed: agreed,
        option: chosen,
      });
      setBooked({ code: r.booking_code, option: chosen });
    } catch (e) {
      const err = e as Error & { data?: { options?: OptionView[] } };
      setError(err.message);
      if (err.data?.options) setResult((cur) => (cur ? { ...cur, options: err.data!.options! } : cur));
      setChosen(null);
      setAgreed(false);
    }
    setSaving(false);
  }

  async function keep(status: "waiting_availability" | "awaiting_approval") {
    setSaving(true);
    setError(null);
    try {
      const r = await post<{ transferId: string }>("/api/walkin-transfer/save", {
        transferId: savedId,
        status,
        clientId,
        walkinName: name,
        walkinPhone: phone || null,
        services,
        duration,
        originPrice,
        date,
        time,
        option: status === "awaiting_approval" ? chosen : null,
      });
      setSavedId(r.transferId);
      onBooked(status === "awaiting_approval" ? `${name}'s option is saved — awaiting the client's answer.` : `${name} is saved as waiting for availability.`);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  }

  const canSearch = services.length > 0 && name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Find another branch"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/5 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-coral-dark">Walk-in transfer</p>
            <h2 className="text-lg font-semibold text-ink">{booked ? "Booked at another branch" : "Find another branch"}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink/40 hover:bg-blush hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="status-colors flex-1 overflow-y-auto px-6 py-5">
          {booked ? (
            <div className="text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-100 text-green-700">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <p className="mt-3 text-lg font-semibold text-ink">
                {name} is booked at {booked.option.branchName}
              </p>
              <p className="text-sm text-ink/60">
                {dayLabel(booked.option.date, result?.today ?? todayKey())} at {fmt(booked.option.start)} with {booked.option.staffName} · booking #{booked.code}
              </p>
              {booked.option.address && (
                <p className="mx-auto mt-2 flex max-w-md items-start justify-center gap-1 text-xs text-ink/55">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {booked.option.address}
                </p>
              )}
              <p className="mx-auto mt-4 max-w-md rounded-xl bg-cream px-4 py-3 text-xs text-ink/70">
                {booked.option.branchName}&apos;s front desk now sees this booking. They check {name.split(" ")[0]} in and start the service when they arrive — nothing
                has started here.{clientId ? " The client was notified." : ""}
              </p>
              <button
                onClick={() => onBooked(`${name} is booked at ${booked.option.branchName}, ${fmt(booked.option.start)} (#${booked.code}).`)}
                className="mt-5 rounded-full bg-coral px-6 py-2.5 text-sm font-semibold text-white"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* The request */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-ink/60">
                  Client
                  <input value={name} onChange={(e) => setName(e.target.value)} disabled={!!clientId} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink disabled:bg-ink/5" />
                </label>
                <label className="text-xs font-medium text-ink/60">
                  Mobile
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!clientId} className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink disabled:bg-ink/5" />
                </label>
              </div>

              <div className="mt-3">
                <p className="text-xs font-medium text-ink/60">Requested service{services.length > 1 ? "s" : ""}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {services.map((s) => {
                    const c = catalog?.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
                    return (
                      <span key={s.name} className="flex items-center gap-1 rounded-full bg-blush px-3 py-1 text-xs font-semibold text-ink">
                        {s.name}
                        {c && c.sizes.length > 0 && (
                          <select
                            value={s.size ?? ""}
                            onChange={(e) => setServices((cur) => cur.map((x) => (x.name === s.name ? { ...x, size: (e.target.value || null) as HairSize | null } : x)))}
                            aria-label={`${s.name} hair length`}
                            className="rounded bg-white px-1 text-[11px]"
                          >
                            {c.sizes.map((z) => (
                              <option key={z} value={z}>{z}</option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => setServices((cur) => cur.filter((x) => x.name !== s.name))}
                          aria-label={`Remove ${s.name}`}
                          className="text-ink/40 hover:text-ink"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                  {services.length === 0 && <span className="text-xs text-ink/45">Add the service the client wants.</span>}
                </div>
                <div className="mt-2 flex gap-2">
                  <select value={pick} onChange={(e) => addService(e.target.value)} aria-label="Add a service from any branch" className="min-w-0 flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm text-ink/70">
                    <option value="">+ Add a service (any branch)…</option>
                    {(catalog ?? []).map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} · {c.department} · {c.branches.map((b) => b.branchName).join(", ")}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-ink/60">
                    <Clock className="h-3.5 w-3.5" />
                    <input type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(Math.max(15, Number(e.target.value) || 60))} aria-label="Minutes" className="w-16 rounded-lg border border-ink/15 px-2 py-2 text-sm" />
                    min
                  </label>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-xs font-medium text-ink/60">
                  Day
                  <input type="date" value={date} min={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} className="mt-1 block rounded-lg border border-ink/15 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-ink/60">
                  From
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 block rounded-lg border border-ink/15 px-3 py-2 text-sm" />
                </label>
                <button
                  onClick={search}
                  disabled={!canSearch || searching}
                  className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  <Search className="h-4 w-4" /> {searching ? "Searching…" : result ? "Search again" : "Search all branches"}
                </button>
              </div>

              {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

              {result && !searching && (
                <div className="mt-4 space-y-4">
                  <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${result.origin.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
                    {result.origin.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span>
                      {result.origin.ok ? (
                        <>
                          <b>{here[0] && here[0].date !== result.today ? `This branch has a free time on ${dayLabel(here[0].date, result.today)}` : "This branch can serve them now"}</b>
                          {here[0] ? ` (${fmt(here[0].start)} with ${here[0].staffName})` : ""} — book it here with the normal flow instead.
                        </>
                      ) : (
                        <>
                          <b>Not possible here:</b> {result.origin.reason}.
                        </>
                      )}
                    </span>
                  </p>

                  <OptionGroup title="Available now at another branch" icon={<Sparkles className="h-4 w-4" />} options={now} today={result.today} chosen={chosen} onChoose={(o) => { setChosen(o); setAgreed(false); }} />
                  <OptionGroup title="Later appointment" icon={<Clock className="h-4 w-4" />} options={later} today={result.today} chosen={chosen} onChoose={(o) => { setChosen(o); setAgreed(false); }} />

                  {elsewhere.length === 0 && (
                    <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <p className="font-semibold">No branch has a valid time for this in the next 3 days.</p>
                      <p className="mt-0.5 text-xs">Nothing was booked. Try another day or time, or keep the client as waiting for availability.</p>
                    </div>
                  )}

                  <details className="text-xs text-ink/55">
                    <summary className="cursor-pointer font-semibold">Why other branches weren&apos;t suggested</summary>
                    <ul className="mt-1 space-y-0.5">
                      {result.branches.filter((b) => b.branchId !== result.originBranchId).map((b) => (
                        <li key={b.branchId}>
                          {b.branchName}: {b.ok ? "has options above" : b.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}

              {/* Explain to the client, then confirm */}
              {chosen && (
                <div className="mt-5 rounded-2xl border-2 border-coral bg-blush p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-coral-dark">Explain to the client</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <div className="rounded-xl bg-white/70 p-3 text-sm">
                      <p className="text-[11px] font-semibold uppercase text-ink/45">Asked for here</p>
                      <p className="font-semibold text-ink">{services.map((s) => s.name).join(", ")}</p>
                      <p className="text-ink/60">{duration} min{originPrice ? ` · ${peso(originPrice)}` : ""}</p>
                    </div>
                    <ArrowRight className="mx-auto hidden h-4 w-4 text-coral-dark sm:block" />
                    <div className="rounded-xl bg-white p-3 text-sm">
                      <p className="text-[11px] font-semibold uppercase text-ink/45">{chosen.immediate ? "Now at" : "Appointment at"}</p>
                      <p className="font-semibold text-ink">{chosen.branchName}</p>
                      <p className="text-ink/70">
                        {dayLabel(chosen.date, result?.today ?? todayKey())} · {fmt(chosen.start)}–{fmt(chosen.start + chosen.duration)}
                      </p>
                      <p className="text-ink/70">with {chosen.staffName}</p>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 text-xs text-ink/70">
                    {chosen.address && (
                      <li className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral-dark" /> {chosen.address}</li>
                    )}
                    {chosen.travelMinutes > 0 && (
                      <li className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5 text-coral-dark" /> About {chosen.travelMinutes} min away — the time already allows for the trip.</li>
                    )}
                    {chosen.phone && <li className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-coral-dark" /> {chosen.phone}</li>}
                    <li className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-coral-dark" /> {chosen.services.map((s) => s.name).join(", ")} · {chosen.duration} min · {peso(chosen.price)} there
                    </li>
                  </ul>
                  {chosen.priceDiffers && originPrice ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                      Price differs: {peso(chosen.price)} at {chosen.branchName} vs {peso(originPrice)} here — tell the client.
                    </p>
                  ) : null}
                  <label className="mt-3 flex items-start gap-2 text-sm font-medium text-ink">
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-coral" />
                    The client agreed to this branch, time and price.
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => keep("awaiting_approval")}
                      disabled={saving}
                      className="flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink/70 hover:border-coral disabled:opacity-50"
                    >
                      Client is still deciding
                    </button>
                    <button
                      onClick={confirm}
                      disabled={!agreed || saving}
                      className="flex-1 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {saving ? "Re-checking & booking…" : "Confirm booking"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!booked && (
          <div className="flex items-center justify-between gap-2 border-t border-ink/5 px-6 py-3">
            <button
              onClick={() => keep("waiting_availability")}
              disabled={saving || !canSearch}
              className="text-xs font-semibold text-ink/55 hover:text-coral-dark disabled:opacity-40"
            >
              Keep as “waiting for availability”
            </button>
            <button onClick={onClose} className="rounded-full border border-ink/15 px-4 py-1.5 text-sm font-semibold text-ink/70">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionGroup({
  title,
  icon,
  options,
  today,
  chosen,
  onChoose,
}: {
  title: string;
  icon: React.ReactNode;
  options: OptionView[];
  today: string;
  chosen: OptionView | null;
  onChoose: (o: OptionView) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <span className="text-coral-dark">{icon}</span> {title}
      </h3>
      <ul className="space-y-2">
        {options.map((o) => {
          const on = chosen && chosen.branchId === o.branchId && chosen.staffId === o.staffId && chosen.date === o.date && chosen.start === o.start;
          return (
            <li key={`${o.branchId}-${o.staffId}-${o.date}-${o.start}`}>
              <button
                onClick={() => onChoose(o)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${on ? "border-coral bg-blush" : "border-ink/10 hover:border-coral/60"}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${o.immediate ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                  {o.immediate ? <Sparkles className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">
                    {o.branchName} · {dayLabel(o.date, today)} {fmt(o.start)}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink/55">
                    <span className="flex items-center gap-1"><UserRound className="h-3 w-3" /> {o.staffName}{o.alsoFree ? ` (+${o.alsoFree} more free)` : ""}</span>
                    {o.travelMinutes > 0 && <span className="flex items-center gap-1"><Car className="h-3 w-3" /> ~{o.travelMinutes} min away</span>}
                    <span>{peso(o.price)}</span>
                    {o.priceDiffers && <span className="font-semibold text-amber-700">price differs</span>}
                  </span>
                </span>
                {on && <Check className="h-5 w-5 text-coral-dark" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
