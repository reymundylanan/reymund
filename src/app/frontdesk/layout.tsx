import FrontDeskSidebar from "@/components/frontdesk/FrontDeskSidebar";
import FrontDeskTopbar from "@/components/frontdesk/FrontDeskTopbar";

export default function FrontDeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f7f8fa]">
      <FrontDeskSidebar />
      <div className="flex-1">
        <FrontDeskTopbar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
