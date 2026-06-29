import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BranchGallery from "@/components/branches/BranchGallery";
import BranchExplorer from "@/components/branches/BranchExplorer";

export default function BranchDetailPage() {
  return (
    <>
      <Header />
      <main className="flex-1">
        <BranchGallery />
        <BranchExplorer />
      </main>
      <Footer />
    </>
  );
}
