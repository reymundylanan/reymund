"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reviewerName } from "@/lib/reviews";
import { peso } from "@/lib/vouchers";
import {
  VOUCHER_PAGE_SIZE,
  adjustPoints,
  cancelVoucher,
  getRedemptionSettings,
  getRedemptionStats,
  listOptions,
  listVouchers,
  saveOption,
  saveRedemptionSettings,
  searchClients,
  validateAdjustment,
  validateOption,
  type AdminVoucherRow,
  type StatsResult,
  type VouchersResult,
  type OptionInput,
} from "@/lib/supabase/queries/adminVouchers";

type Settings = { maxPerBooking: number; enabled: boolean };
type Client = { id: string; name: string; balance: number };

const NOT_SET_UP = "Not set up yet — apply migration 053.";
const input = "rounded-lg border border-ink/15 px-3 py-2 text-sm";
const btn = "rounded-full bg-coral px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const ghost = "rounded-full border border-ink/15 px-4 py-1.5 text-xs font-semibold text-ink disabled:opacity-50";
const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  used: "bg-sky-50 text-sky-700",
  expired: "bg-ink/5 text-ink/50",
  cancelled: "bg-red-50 text-red-600",
};

const EMPTY_OPTION: OptionInput = {
  id: null,
  name: "",
  pointsCost: 500,
  discountAmount: 50,
  validDays: 90,
  active: true,
  sortOrder: 0,
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function RedemptionAdmin() {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [options, setOptions] = useState<(OptionInput & { id: string })[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [vouchers, setVouchers] = useState<{
    rows: AdminVoucherRow[];
    total: number;
  } | null>(null);
  const [vouchersStatus, setVouchersStatus] = useState<"loading" | "ok" | "unavailable" | "error">("loading");
  const voucherReq = useRef(0);
  // Synchronous double-click guards (state updates lag a fast second click).
  const adjustInFlight = useRef(false);
  const toggleInFlight = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // options form
  const [optForm, setOptForm] = useState<OptionInput | null>(null);
  const [optError, setOptError] = useState<string | null>(null);
  const [optSaving, setOptSaving] = useState(false);

  // vouchers
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<AdminVoucherRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // settings
  const [maxText, setMaxText] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [confirmSettings, setConfirmSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // adjust
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [clientSearchFailed, setClientSearchFailed] = useState(false);
  const [client, setClient] = useState<Client | null>(null);
  const [pointsText, setPointsText] = useState("");
  const [reason, setReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [confirmAdjust, setConfirmAdjust] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 5000);
  }

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getRedemptionStats(createClient()));
    } catch (e) {
      console.error("load redemption stats failed:", e);
      setStats({ status: "error" });
    }
  }, []);

  const refreshOptions = useCallback(async () => {
    try {
      setOptions(await listOptions(createClient()));
    } catch (e) {
      console.error("load reward options failed:", e);
    }
  }, []);

  const refreshVouchers = useCallback(async () => {
    try {
      const id = ++voucherReq.current;
      const r: VouchersResult = await listVouchers(createClient(), {
        search,
        status,
        page,
      });
      if (id !== voucherReq.current) return; // a newer request superseded this one
      if (r.status === "ok") {
        setVouchers({ rows: r.rows, total: r.total });
        setVouchersStatus("ok");
      } else {
        setVouchersStatus(r.status); // keep previous rows on error
      }
    } catch (e) {
      console.error("load vouchers failed:", e);
      setVouchersStatus("error");
    }
  }, [search, status, page]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const s = await getRedemptionSettings(createClient());
        if (cancelled) return;
        setSettings(s);
        if (s) {
          setMaxText(String(s.maxPerBooking));
          setEnabled(s.enabled);
        }
      } catch (e) {
        console.error("load redemption settings failed:", e);
      }
      if (cancelled) return;
      await Promise.all([refreshStats(), refreshOptions()]);
      if (!cancelled) setLoaded(true);
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [refreshStats, refreshOptions]);

  useEffect(() => {
    const t = setTimeout(refreshVouchers, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [refreshVouchers, search]);

  useEffect(() => {
    const term = clientQuery.trim();
    if (!term || (client && client.name === term)) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchClients(createClient(), term);
        if (cancelled) return;
        setClientSearchFailed(r === null);
        setClientResults(r ?? []);
      } catch (e) {
        console.error("search clients failed:", e);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [clientQuery, client]);

  async function submitOption() {
    if (!optForm) return;
    const err = validateOption(optForm);
    setOptError(err);
    if (err) return;
    setOptSaving(true);
    const saveErr = await saveOption(createClient(), optForm);
    setOptSaving(false);
    if (saveErr) {
      setOptError(saveErr);
      return;
    }
    setOptForm(null);
    showToast("Reward option saved.");
    await refreshOptions();
  }

  async function toggleActive(o: OptionInput & { id: string }) {
    if (toggleInFlight.current) return;
    toggleInFlight.current = true;
    try {
      const err = await saveOption(createClient(), { ...o, active: !o.active });
      if (err) showToast(err);
      else await refreshOptions();
    } finally {
      toggleInFlight.current = false;
    }
  }

  async function submitCancel() {
    if (!cancelTarget) return;
    const r = cancelReason.trim();
    if (!r || r.length > 500) {
      setCancelError("Enter a reason (up to 500 characters).");
      return;
    }
    setCancelling(true);
    const err = await cancelVoucher(createClient(), cancelTarget.id, r);
    setCancelling(false);
    if (err) {
      setCancelError(err);
      return;
    }
    setCancelTarget(null);
    setCancelReason("");
    setCancelError(null);
    showToast("Voucher cancelled. Points returned.");
    await Promise.all([refreshVouchers(), refreshStats()]);
  }

  const maxNum = maxText.trim() === "" ? NaN : Number(maxText);
  const maxInvalid = !Number.isFinite(maxNum) || maxNum <= 0 || maxNum > 100_000;

  async function saveSettings() {
    setSettingsSaving(true);
    const next = { maxPerBooking: maxNum, enabled };
    const err = await saveRedemptionSettings(createClient(), next);
    setSettingsSaving(false);
    setConfirmSettings(false);
    if (err) {
      setSettingsError(err);
      return;
    }
    setSettingsError(null);
    setSettings(next);
    showToast("Redemption settings saved.");
  }

  const pointsNum = pointsText.trim() === "" ? NaN : Number(pointsText);

  function requestAdjust() {
    const err = validateAdjustment(pointsNum, reason);
    setAdjustError(err);
    if (!err) setConfirmAdjust(true);
  }

  async function submitAdjust() {
    if (!client || adjustInFlight.current) return;
    adjustInFlight.current = true;
    setAdjusting(true);
    let r: Awaited<ReturnType<typeof adjustPoints>>;
    try {
      r = await adjustPoints(createClient(), client.id, pointsNum, reason);
    } finally {
      adjustInFlight.current = false;
    }
    setAdjusting(false);
    setConfirmAdjust(false);
    if ("error" in r) {
      setAdjustError(r.error);
      return;
    }
    setAdjustError(null);
    setClient({ ...client, balance: r.balance });
    setPointsText("");
    setReason("");
    showToast(`${reviewerName(client.name)} now has ${r.balance.toLocaleString("en-PH")} GlowPoints.`);
    refreshStats();
  }

  const notSet = <p className="py-6 text-center text-sm text-ink/40">{NOT_SET_UP}</p>;
  const pages = vouchers ? Math.max(1, Math.ceil(vouchers.total / VOUCHER_PAGE_SIZE)) : 1;
  const optInvalid = optForm ? validateOption(optForm) : null;
  const tile = "rounded-2xl bg-white p-4 shadow-sm";
  const tileLabel = "text-xs font-semibold uppercase text-ink/40";

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-ink">GlowPoints Redemption</h2>

      <section aria-label="Redemption stats">
        {stats === null ? null : stats.status === "unavailable" ? (
          <div className={tile}>{notSet}</div>
        ) : stats.status === "error" ? (
          <div className={tile}>
            <p className="py-6 text-center text-sm text-ink/60">
              Couldn&apos;t load stats —{" "}
              <button className="font-semibold text-coral-dark underline" onClick={refreshStats}>
                Retry
              </button>
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className={tile}>
              <p className={tileLabel}>Points redeemed this month</p>
              <p className="mt-1 text-xl font-semibold text-ink">{stats.stats.pointsRedeemedThisMonth.toLocaleString("en-PH")}</p>
            </div>
            <div className={tile}>
              <p className={tileLabel}>Active vouchers</p>
              <p className="mt-1 text-xl font-semibold text-ink">{stats.stats.activeVouchers}</p>
            </div>
            <div className={tile}>
              <p className={tileLabel}>Discounts given this month</p>
              <p className="mt-1 text-xl font-semibold text-ink">{peso(stats.stats.discountsThisMonth)}</p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Reward Options</h2>
          {options !== null && (
            <button
              className={btn}
              onClick={() => {
                setOptError(null);
                setOptForm({
                  ...EMPTY_OPTION,
                  sortOrder: (options.at(-1)?.sortOrder ?? 0) + 1,
                });
              }}
            >
              Add option
            </button>
          )}
        </div>
        {options === null ? (
          loaded ? (
            notSet
          ) : null
        ) : options.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/40">No reward options yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink/40">
                <tr>
                  <th className="py-2 pr-3">Name</th>
                  <th className="pr-3">Points</th>
                  <th className="pr-3">Discount</th>
                  <th className="pr-3">Valid days</th>
                  <th className="pr-3">Active</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {options.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 pr-3 font-medium text-ink">{o.name}</td>
                    <td className="pr-3">{o.pointsCost.toLocaleString("en-PH")}</td>
                    <td className="pr-3">{peso(o.discountAmount)}</td>
                    <td className="pr-3">{o.validDays}</td>
                    <td className="pr-3">
                      <input type="checkbox" checked={o.active} onChange={() => toggleActive(o)} aria-label={`${o.name} active`} />
                    </td>
                    <td className="text-right">
                      <button
                        className={ghost}
                        onClick={() => {
                          setOptError(null);
                          setOptForm(o);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {optForm && (
          <div className="mt-4 space-y-3 rounded-2xl border border-ink/10 p-4">
            <p className="text-sm font-semibold text-ink">{optForm.id ? "Edit option" : "Add option"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-ink">
                Name
                <input className={`${input} mt-1 w-full`} value={optForm.name} onChange={(e) => setOptForm({ ...optForm, name: e.target.value })} />
              </label>
              <label className="text-sm text-ink">
                Points cost
                <input
                  type="number"
                  inputMode="numeric"
                  className={`${input} mt-1 w-full`}
                  value={Number.isNaN(optForm.pointsCost) ? "" : optForm.pointsCost}
                  onChange={(e) =>
                    setOptForm({
                      ...optForm,
                      pointsCost: e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="text-sm text-ink">
                Discount (₱)
                <input
                  type="number"
                  inputMode="decimal"
                  className={`${input} mt-1 w-full`}
                  value={Number.isNaN(optForm.discountAmount) ? "" : optForm.discountAmount}
                  onChange={(e) =>
                    setOptForm({
                      ...optForm,
                      discountAmount: e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="text-sm text-ink">
                Valid days
                <input
                  type="number"
                  inputMode="numeric"
                  className={`${input} mt-1 w-full`}
                  value={Number.isNaN(optForm.validDays) ? "" : optForm.validDays}
                  onChange={(e) =>
                    setOptForm({
                      ...optForm,
                      validDays: e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={optForm.active} onChange={(e) => setOptForm({ ...optForm, active: e.target.checked })} />
              Active
            </label>
            {(optError ?? optInvalid) && <p className="text-xs text-red-600">{optError ?? optInvalid}</p>}
            <div className="flex gap-2">
              <button className={btn} disabled={optSaving || !!optInvalid} onClick={submitOption}>
                {optSaving ? "Saving…" : "Save option"}
              </button>
              <button className={ghost} onClick={() => setOptForm(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-ink">Vouchers</h2>
        {vouchersStatus === "unavailable" ? (
          notSet
        ) : vouchersStatus === "loading" && !vouchers ? null : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className={`${input} min-w-0 flex-1`}
                placeholder="Search code or client"
                aria-label="Search vouchers"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <select
                className={input}
                aria-label="Voucher status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="used">Used</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            {vouchersStatus === "error" && (
              <p className="mt-3 text-sm text-red-600">
                Couldn&apos;t load vouchers —{" "}
                <button className="font-semibold underline" onClick={refreshVouchers}>
                  Retry
                </button>
              </p>
            )}
            {!vouchers || vouchers.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink/40">No vouchers found.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-ink/40">
                    <tr>
                      <th className="py-2 pr-3">Code</th>
                      <th className="pr-3">Client</th>
                      <th className="pr-3">Reward</th>
                      <th className="pr-3">Status</th>
                      <th className="pr-3">Created</th>
                      <th className="pr-3">Expires / used</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {vouchers!.rows.map((v) => (
                      <tr key={v.id}>
                        <td className="py-2 pr-3 font-mono text-xs">{v.code}</td>
                        <td className="pr-3">{reviewerName(v.clientName)}</td>
                        <td className="pr-3">{v.name}</td>
                        <td className="pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[v.status] ?? ""}`}>
                            {v.status}
                          </span>
                        </td>
                        <td className="pr-3">{fmtDate(v.createdAt)}</td>
                        <td className="pr-3">
                          {v.status === "used" && v.usedAt
                            ? `Used ${fmtDate(v.usedAt)}${v.discountApplied != null ? ` (${peso(v.discountApplied)})` : ""}`
                            : fmtDate(v.expiresAt)}
                        </td>
                        <td className="text-right">
                          {v.status === "active" && (
                            <button
                              className={ghost}
                              onClick={() => {
                                setCancelTarget(v);
                                setCancelReason("");
                                setCancelError(null);
                              }}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-xs text-ink/60">
                <button className={ghost} disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span>
                  Page {page} of {pages}
                </span>
                <button className={ghost} disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-ink">Redemption settings</h2>
        {settings === null ? (
          loaded ? (
            notSet
          ) : null
        ) : (
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm text-ink">
              Max discount per booking (₱)
              <input
                type="number"
                inputMode="decimal"
                className={`${input} w-28`}
                value={maxText}
                onChange={(e) => {
                  setMaxText(e.target.value);
                  setSettingsError(null);
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setEnabled(e.target.checked);
                  setSettingsError(null);
                }}
              />
              Redemption enabled
            </label>
            {(settingsError || maxInvalid) && (
              <p className="text-xs text-red-600">{settingsError ?? "Max discount must be more than ₱0 and at most ₱100,000."}</p>
            )}
            <button className={btn} disabled={settingsSaving || maxInvalid} onClick={() => setConfirmSettings(true)}>
              Save settings
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-ink">Adjust points</h2>
        <div className="mt-3 space-y-3">
          <div>
            <input
              className={`${input} w-full`}
              placeholder="Search client by name"
              aria-label="Search clients"
              value={clientQuery}
              onChange={(e) => {
                setClientQuery(e.target.value);
                setClient(null);
                setPointsText("");
                setReason("");
                setAdjustError(null);
                if (!e.target.value.trim()) setClientResults([]);
              }}
            />
            {clientSearchFailed && <p className="mt-1 text-xs text-red-600">Couldn&apos;t search clients. Please try again.</p>}
            {!client && clientQuery.trim() && clientResults.length > 0 && (
              <ul className="mt-1 divide-y divide-ink/5 rounded-lg border border-ink/10">
                {clientResults.map((c) => (
                  <li key={c.id}>
                    <button
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blush/40"
                      onClick={() => {
                        setPointsText("");
                        setReason("");
                        setAdjustError(null);
                        setClient(c);
                        setClientQuery(c.name);
                        setClientResults([]);
                      }}
                    >
                      <span>{c.name || "Client"}</span>
                      <span className="text-xs text-ink/50">{c.balance.toLocaleString("en-PH")} pts</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {client && (
            <>
              <p className="text-sm text-ink">
                {reviewerName(client.name)} · balance <span className="font-semibold">{client.balance.toLocaleString("en-PH")}</span> GlowPoints
              </p>
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                <input
                  type="number"
                  inputMode="numeric"
                  className={input}
                  placeholder="+/− points"
                  aria-label="Points to add or remove"
                  value={pointsText}
                  onChange={(e) => setPointsText(e.target.value)}
                />
                <input
                  className={input}
                  placeholder="Reason"
                  aria-label="Reason"
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              {adjustError && <p className="text-xs text-red-600">{adjustError}</p>}
              <button className={btn} disabled={adjusting} onClick={requestAdjust}>
                Adjust points
              </button>
            </>
          )}
        </div>
      </section>

      {cancelTarget && (
        <Dialog onClose={() => setCancelTarget(null)}>
          <p className="font-semibold text-ink">Cancel voucher {cancelTarget.code}?</p>
          <p className="mt-1 text-sm text-ink/60">The client&apos;s points will be returned.</p>
          <textarea
            className={`${input} mt-3 w-full`}
            rows={3}
            maxLength={500}
            placeholder="Reason"
            aria-label="Cancellation reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          {cancelError && <p className="mt-1 text-xs text-red-600">{cancelError}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setCancelTarget(null)} className={`${ghost} flex-1`}>
              Keep voucher
            </button>
            <button onClick={submitCancel} disabled={cancelling} className={`${btn} flex-1`}>
              {cancelling ? "Cancelling…" : "Cancel voucher"}
            </button>
          </div>
        </Dialog>
      )}

      {confirmSettings && (
        <Dialog onClose={() => setConfirmSettings(false)}>
          <p className="font-semibold text-ink">Save redemption settings?</p>
          <p className="mt-1 text-sm text-ink/60">New values apply immediately.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmSettings(false)} className={`${ghost} flex-1`}>
              Cancel
            </button>
            <button onClick={saveSettings} disabled={settingsSaving} className={`${btn} flex-1`}>
              {settingsSaving ? "Saving…" : "Confirm"}
            </button>
          </div>
        </Dialog>
      )}

      {confirmAdjust && client && (
        <Dialog onClose={() => setConfirmAdjust(false)}>
          <p className="font-semibold text-ink">
            {pointsNum > 0 ? "Add" : "Remove"} {Math.abs(pointsNum).toLocaleString("en-PH")} GlowPoints {pointsNum > 0 ? "to" : "from"}{" "}
            {reviewerName(client.name)}?
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmAdjust(false)} className={`${ghost} flex-1`}>
              Cancel
            </button>
            <button onClick={submitAdjust} disabled={adjusting} className={`${btn} flex-1`}>
              {adjusting ? "Saving…" : "Confirm"}
            </button>
          </div>
        </Dialog>
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
