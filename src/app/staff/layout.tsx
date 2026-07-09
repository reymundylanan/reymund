import StaffSidebar from "@/components/staff/StaffSidebar";
import StaffTopbar from "@/components/staff/StaffTopbar";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f8fa]">
      <StaffSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <StaffTopbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}
