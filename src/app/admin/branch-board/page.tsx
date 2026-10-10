import { redirect } from "next/navigation";

// The Branch Board grew into Multi-Branch Management.
export default function AdminBranchBoardPage() {
  redirect("/admin/multi-branch");
}
