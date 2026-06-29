import { FileText, RefreshCcw } from "lucide-react";

export default function ReconciliationTool() {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-ink">GCash Reconciliation Tool</h2>
      <p className="text-sm text-ink/50">
        Match system records with GCash merchant dashboards automatically.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-ink/10 p-4">
          <p className="text-sm font-semibold text-ink">Step 1: Upload Statement</p>
          <p className="mt-1 text-xs text-ink/50">
            Upload your daily GCash .csv export to begin the auto-matching
            process.
          </p>
          <button className="mt-4 flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-medium text-ink/70 hover:border-coral">
            <FileText className="h-4 w-4" /> Choose File
          </button>
        </div>

        <div className="rounded-xl border border-ink/10 p-4">
          <p className="text-sm font-semibold text-ink">
            Step 2: Verify Discrepancies
          </p>
          <p className="mt-1 text-xs text-ink/50">
            The system will flag any reference IDs that exist in GCash but
            not in GlowSync.
          </p>
          <button className="mt-4 flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral-dark">
            <RefreshCcw className="h-4 w-4" /> Run Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
