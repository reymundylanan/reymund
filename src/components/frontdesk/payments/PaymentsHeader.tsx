export default function PaymentsHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold text-ink">Payments &amp; Walk-ins</h1>
        <p className="text-sm text-ink/50">
          Manage daily digital transactions and guest intakes.
        </p>
      </div>
      <div className="flex gap-3">
        <div className="rounded-xl bg-red-50 px-4 py-2 text-center">
          <p className="text-xl font-semibold text-red-600">08</p>
          <p className="text-[11px] text-ink/50">Unmatched Today</p>
        </div>
        <div className="rounded-xl bg-blush px-4 py-2 text-center">
          <p className="text-xl font-semibold text-coral-dark">12</p>
          <p className="text-[11px] text-ink/50">Walk-ins (Daily)</p>
        </div>
      </div>
    </div>
  );
}
