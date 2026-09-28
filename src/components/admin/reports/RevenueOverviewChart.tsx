import type { SeriesPoint } from "@/lib/supabase/queries/reports";

export default function RevenueOverviewChart({ data }: { data: SeriesPoint[] }) {
  const width = 560;
  const height = 200;
  const padding = 32;
  const max = Math.max(1, ...data.map((d) => d.value));

  const points = data.map((d, i) => {
    const x = data.length > 1 ? padding + (i / (data.length - 1)) * (width - padding * 2) : width / 2;
    const y = height - padding - (d.value / max) * (height - padding * 2);
    return { x, y, d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? width / 2} ${height - padding} L ${points[0]?.x ?? width / 2} ${height - padding} Z`;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Revenue Overview</h2>
      </div>

      {data.length === 0 ? (
        <p className="mt-8 py-8 text-center text-sm text-ink/40">No revenue recorded for this period.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 w-full">
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4a3b0" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f4a3b0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#revenueFill)" />
          <path d={linePath} fill="none" stroke="#e8798e" strokeWidth={2.5} />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#e8798e" />
          ))}
          {points.map((p, i) => (
            <text key={i} x={p.x} y={height - 8} textAnchor="middle" className="fill-ink/40" fontSize={10}>
              {p.d.label}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
