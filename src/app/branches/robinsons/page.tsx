import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BranchGallery from "@/components/branches/BranchGallery";
import BranchExplorer from "@/components/branches/BranchExplorer";
import { branchContacts } from "@/lib/data";

export default function RobinsonsBranchPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <BranchGallery
          name="Blush Spa Aesthetics - Robinsons Pagadian"
          street="F.S. Pajares Ave cor P.L. Urro St, cor Vicencio Sagun St."
        />
        <BranchExplorer defaultBranchId={branchContacts[1].id} />
      </main>
      <Footer />
    </>
  );
}
