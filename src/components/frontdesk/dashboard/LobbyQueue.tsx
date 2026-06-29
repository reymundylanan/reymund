import { User } from "lucide-react";
import { lobbyQueue } from "@/lib/frontdeskData";

export default function LobbyQueue() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Lobby Queue</h2>
        <span className="rounded-full bg-blush px-3 py-1 text-xs font-medium text-coral-dark">
          {lobbyQueue.length} Waiting
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {lobbyQueue.map((q) => (
          <div key={q.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blush text-ink/40">
                <User className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{q.name}</p>
                <p className="text-xs text-ink/50">{q.service}</p>
              </div>
            </div>
            <span className="text-xs font-medium text-ink/40">
              {q.waitingMinutes}m
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
