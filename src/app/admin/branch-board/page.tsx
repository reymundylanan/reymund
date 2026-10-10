import { redirect } from "next/navigation";

// The Branch Board grew into Multi-Branch.
export default function AdminBranchBoardPage() {
  redirect("/admin/multi-branch");
}
