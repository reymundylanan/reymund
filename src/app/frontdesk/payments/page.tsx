import PaymentsHeader from "@/components/frontdesk/payments/PaymentsHeader";
import GCashFeedTable from "@/components/frontdesk/payments/GCashFeedTable";
import SidePanels from "@/components/frontdesk/payments/SidePanels";

export default function FrontDeskPaymentsPage() {
  return (
    <div className="space-y-6">
      <PaymentsHeader />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <GCashFeedTable />
        <SidePanels />
      </div>
    </div>
  );
}
