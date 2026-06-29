"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BranchesHero from "@/components/branches/BranchesHero";
import BranchListSidebar from "@/components/branches/BranchListSidebar";
import MapPanel from "@/components/branches/MapPanel";
import { branchContacts } from "@/lib/data";

export default function BranchesPage() {
  const [selectedId, setSelectedId] = useState(branchContacts[0].id);
  const selectedBranch =
    branchContacts.find((b) => b.id === selectedId) ?? branchContacts[0];

  return (
    <>
      <Header />
      <main className="flex-1">
        <BranchesHero />
        <section className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
            <BranchListSidebar selectedId={selectedId} onSelect={setSelectedId} />
            <MapPanel address={selectedBranch.address} />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
