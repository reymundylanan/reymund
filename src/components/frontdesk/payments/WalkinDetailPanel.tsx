"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, PlayCircle, User, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateWalkinNotes, walkinProfessionalName, walkinServiceName, type WalkinRow } from "@/lib/supabase/queries/walkins";
import type { SessionStatus } from "@/lib/sessionStatus";
import { computeServiceTiming, formatElapsedClock } from "@/lib/serviceTiming";
import { computeWalkinTimeline, walkinStatusKey, walkinStatusLabel, walkinStatusStyle } from "@/components/frontdesk/payments/walkinStatus";

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export default function WalkinDetailPanel({
  walkin,
  now,
  busy,
  onClose,
  onStart,
  onFinish,
  onNotesSaved,
}: {
  walkin: WalkinRow | null;
  now: Date;
  busy: boolean;
  onClose: () => void;
  onStart: (row: WalkinRow) => void;
  onFinish: (row: WalkinRow) => void;
  onNotesSaved: () => void;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setEditingNotes(false);
    setNotesDraft(walkin?.staff_notes ?? "");
  }, [walkin?.id]);

  if (!walkin) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl bg-white p-6 text-center text-sm text-ink/40 shadow-sm">
        Select a walk-in from the list to see details.
      </div>
    );
  }

  const sessionStatus = (walkin.session_status ?? "waiting") as SessionStatus;
  const timing = walkin.service_started_at ? computeServiceTiming(walkin.service_started_at, walkin.duration_minutes, now) : null;
  const statusKey = walkinStatusKey(sessionStatus, sessionStatus === "in_service" ? timing : null);
  const elapsedMs = walkin.service_started_at ? now.getTime() - new Date(walkin.service_started_at).getTime() : 0;
  const timeline = computeWalkinTimeline(walkin, now);

  async function saveNotes() {
    setSavingNotes(true);
    const supabase = createClient();
    await updateWalkinNotes(supabase, walkin!.id, notesDraft.trim());
    setSavingNotes(false);
    setEditingNotes(false);
    onNotesSaved();
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush text-lg font-semibold text-coral-dark">
            {walkin.walkin_name?.charAt(0).toUpperCase() ?? "?"}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-ink">{walkin.walkin_name}</p>
              <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-semibold text-pink-600">Walk-In</span>
            </div>
            <p className="text-xs text-ink/50">
              {walkinServiceName(walkin)} · {walkin.duration_minutes} min
            </p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-ink/40 hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-ink/50">
        <User className="h-3.5 w-3.5" />
        {walkinProfessionalName(walkin)}
      </div>

      <div className={`mt-4 rounded-xl p-4 ${statusKey === "overdue" ? "bg-red-50" : statusKey === "time_reached" ? "bg-amber-50" : statusKey === "completed" ? "bg-green-50" : "bg-blue-50"}`}>
        <div className="flex items-center gap-2">
          {statusKey === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-ink/50" />}
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${walkinStatusStyle(statusKey)}`}>{walkinStatusLabel(statusKey)}</span>
        </div>
        {sessionStatus === "in_service" && walkin.service_started_at && (
          <>
            <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{formatElapsedClock(elapsedMs)}</p>
            <p className="text-xs text-ink/50">
              Started at {clockTime(walkin.service_started_at)}
              {timing?.kind === "remaining" && ` · Est. remaining ${timing.minutes} min`}
              {timing?.kind === "time_reached" && " · Estimated time reached"}
              {timing?.kind === "overdue" && ` · Over by ${timing.minutes} min`}
            </p>
          </>
        )}
        {sessionStatus !== "in_service" && !["completed", "paid"].includes(sessionStatus) && (
          <p className="mt-2 text-sm text-ink/60">
            {walkin.arrival_time ? `Checked in at ${clockTime(walkin.arrival_time)}` : "Not checked in yet"}
          </p>
        )}
        {["completed", "paid"].includes(sessionStatus) && walkin.completed_at && (
          <p className="mt-2 text-sm text-ink/60">Completed at {clockTime(walkin.completed_at)}</p>
        )}
      </div>

      {sessionStatus === "in_service" && (
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-ink/10 p-3 text-center">
          <div>
            <p className="text-[11px] text-ink/40">Service Duration</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{walkin.duration_minutes} min</p>
          </div>
          <div>
            <p className="text-[11px] text-ink/40">Elapsed Time</p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{Math.floor(elapsedMs / 60000)} min</p>
          </div>
          <div>
            <p className="text-[11px] text-ink/40">Remaining (est.)</p>
            <p className={`mt-0.5 text-sm font-semibold ${timing?.kind === "overdue" ? "text-red-600" : "text-ink"}`}>
              {timing?.kind === "remaining" ? `${timing.minutes} min` : timing?.kind === "overdue" ? `Over ${timing.minutes} min` : "Reached"}
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {(sessionStatus === "waiting" || sessionStatus === "ready" || sessionStatus === "arrived" || sessionStatus === "late_arrival") && (
          <button
            onClick={() => onStart(walkin)}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <PlayCircle className="h-4 w-4" /> Start Service
          </button>
        )}
        {sessionStatus === "in_service" && (
          <button
            onClick={() => onFinish(walkin)}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Finish Service
          </button>
        )}
        <button
          onClick={() => setEditingNotes((v) => !v)}
          className="rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-ink/30"
        >
          Add Note
        </button>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Walk-In Status Flow</p>
        <div className="mt-2 space-y-3">
          {timeline.map((step) => (
            <div key={step.key} className="flex gap-2.5">
              <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${step.done ? "bg-teal-500" : "bg-ink/15"}`} />
              <div>
                <p className={`text-sm font-medium ${step.done ? "text-ink" : "text-ink/40"}`}>{step.label}</p>
                <p className={`text-xs ${step.done ? "text-ink/50" : "text-ink/30"}`}>{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t border-ink/10 pt-4">
        <p className="text-sm font-semibold text-ink">Service Notes</p>
        {editingNotes ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={3}
              placeholder="Add a note about this walk-in..."
              className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-coral"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEditingNotes(false)}
                className="flex-1 rounded-full border border-ink/15 py-1.5 text-xs text-ink/60 hover:border-ink/30"
              >
                Cancel
              </button>
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="flex-1 rounded-full bg-coral py-1.5 text-xs font-semibold text-white hover:bg-coral-dark disabled:opacity-50"
              >
                {savingNotes ? "Saving..." : "Save Note"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-ink/40">{walkin.staff_notes?.trim() ? walkin.staff_notes : "No notes yet."}</p>
        )}
      </div>
    </div>
  );
}
