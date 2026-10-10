import { redirect } from "next/navigation";

// Bookings Management was folded into Multi-Branch (bookings on the board).
export default function AdminBookingsPage() {
  redirect("/admin/multi-branch");
}
