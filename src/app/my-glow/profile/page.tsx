import { redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProfileEditor from "@/components/my-glow/ProfileEditor";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/myProfile";
import { loginRedirectPath } from "@/lib/loginRedirect";
import { logQueryError } from "@/lib/supabase/logQueryError";

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(loginRedirectPath("/my-glow/profile"));

  const { data: roleRow, error: roleError } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  logQueryError("MyProfilePage role", roleError);
  if (!roleRow || roleRow.role !== "customer") redirect("/");

  const profile = await getMyProfile(supabase, auth.user.id);

  return (
    <>
      <Header />
      <main className="flex-1 bg-blush/30 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl space-y-4">
          <Link href="/my-glow" className="text-sm font-medium text-coral-dark hover:underline">
            &larr; Back to My Glow
          </Link>
          {profile ? (
            <ProfileEditor initial={profile} />
          ) : (
            <p role="alert" className="rounded-2xl bg-white p-6 text-sm text-ink/70 shadow-sm">
              We couldn&apos;t load your profile right now. Please refresh the page or try again later.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
