import { Search } from "lucide-react";

export default function AdminTopbar() {
  return (
    <header className="flex items-center justify-between border-b border-ink/10 bg-white px-6 py-4">
      <div className="flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm text-ink/50 w-full max-w-sm">
        <Search className="h-4 w-4" />
        <input
          type="text"
          placeholder="Search bookings, users, or transactions..."
          className="w-full text-sm outline-none placeholder:text-ink/40"
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-sm font-semibold text-coral-dark">
          A
        </span>
        <div className="text-sm">
          <p className="font-medium text-ink">Admin User</p>
          <p className="text-xs text-ink/50">Super Administrator</p>
        </div>
      </div>
    </header>
  );
}
