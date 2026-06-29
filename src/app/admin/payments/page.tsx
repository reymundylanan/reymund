import PaymentsStats from "@/components/admin/payments/PaymentsStats";
import TransactionsTable from "@/components/admin/payments/TransactionsTable";
import ReconciliationTool from "@/components/admin/payments/ReconciliationTool";

export default function AdminPaymentsPage() {
  return (
    <div className="space-y-6">
      <PaymentsStats />
      <TransactionsTable />
      <ReconciliationTool />
    </div>
  );
}
