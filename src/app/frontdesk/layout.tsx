import FrontDeskSidebar from "@/components/frontdesk/FrontDeskSidebar";
import FrontDeskTopbar from "@/components/frontdesk/FrontDeskTopbar";

export default function FrontDeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#DDD5CE]">
      <FrontDeskSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <FrontDeskTopbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}
