import PaymentsHeader from "@/components/frontdesk/payments/PaymentsHeader";
import PaymentsManager from "@/components/frontdesk/payments/PaymentsManager";

export default function FrontDeskPaymentsPage() {
  return (
    <div className="space-y-6">
      <PaymentsHeader />
      <PaymentsManager />
    </div>
  );
}
