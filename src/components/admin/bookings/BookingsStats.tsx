export default function BookingsStats({
  confirmed,
  pending,
  conflict,
}: {
  confirmed: number;
  pending: number;
  conflict: number;
}) {
  return (
    <div className="flex gap-6 rounded-2xl bg-white p-4 px-6 shadow-sm">
      <p className="text-sm">
        <span className="text-lg font-semibold text-green-600">{confirmed}</span>{" "}
        <span className="text-ink/50">Confirmed</span>
      </p>
      <p className="text-sm">
        <span className="text-lg font-semibold text-amber-600">{pending}</span>{" "}
        <span className="text-ink/50">Pending</span>
      </p>
      <p className="text-sm">
        <span className="text-lg font-semibold text-red-600">{conflict}</span>{" "}
        <span className="text-ink/50">Conflicts</span>
      </p>
    </div>
  );
}
