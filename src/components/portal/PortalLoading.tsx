/** Admin / Front Desk page placeholder while the page's data loads on the
 * server (the sidebar and top bar stay as they are), so opening a page
 * responds at once instead of showing nothing. */
export default function PortalLoading() {
  const block = "rounded-2xl bg-[#efe3c6]/60 motion-safe:animate-pulse";
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div className={`h-28 ${block}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-24 ${block}`} style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`h-72 lg:col-span-2 ${block}`} />
        <div className={`h-72 ${block}`} />
      </div>
    </div>
  );
}
