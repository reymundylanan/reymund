import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Reset Password — Blush Spa & Aesthetics" };

export default function ResetPasswordPage() {
  return (
    <>
      <Header />
      <main className="flex flex-1 items-center justify-center bg-cream px-4 py-14">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-champagne/60">
          <ResetPasswordForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
