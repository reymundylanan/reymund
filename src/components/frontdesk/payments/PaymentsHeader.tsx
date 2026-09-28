export default function PaymentsHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold text-ink">Payments</h1>
        <p className="text-sm text-ink/50">
          Manage daily digital transactions.
        </p>
      </div>
      <div className="flex items-center divide-x divide-ink/10 text-right">
        <div className="px-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">
            Unmatched Today
          </p>
          <p className="text-xl font-semibold text-teal-600">08</p>
        </div>
        <div className="px-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">
            Walk-ins (Daily)
          </p>
          <p className="text-xl font-semibold text-pink-600">12</p>
        </div>
      </div>
    </div>
  );
}
