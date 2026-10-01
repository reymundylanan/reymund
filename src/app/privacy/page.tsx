import Link from "next/link";
import InfoPage, { InfoSection, SPA_EMAIL, SPA_PHONE } from "@/components/InfoPage";

export const metadata = { title: "Privacy Policy — Blush Spa & Aesthetics" };

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Your Privacy"
      title="Privacy Policy"
      intro="How Blush Spa & Aesthetics (GlowSync) collects, uses and protects your personal information."
      updated="October 2026"
    >
      <InfoSection title="Who we are">
        <p>
          Blush Spa &amp; Aesthetics operates the GlowSync website and booking system for our branches in Pagadian City. We
          handle your personal information in line with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).
        </p>
      </InfoSection>

      <InfoSection title="Information we collect">
        <ul>
          <li>Account details from Google or Facebook sign-in: your name, email address and profile photo.</li>
          <li>Details you give us: phone number, gender, address, allergies and preferences.</li>
          <li>Bookings and visits: services, therapist, branch, dates, times and payment records.</li>
          <li>GCash payment receipts you upload, and the reference number or sender name you enter.</li>
          <li>Reviews, ratings and photos you submit, and feedback messages you send us.</li>
        </ul>
      </InfoSection>

      <InfoSection title="How we use it">
        <ul>
          <li>To book, confirm, remind you of and manage your appointments.</li>
          <li>To verify payments and keep accurate records.</li>
          <li>To send you booking updates and, if you agree, announcements and promotions.</li>
          <li>To publish reviews you choose to share and award GlowPoints. Review text may be checked by an AI service (Google Gemini) to grade helpfulness.</li>
          <li>To improve our services and keep the system secure.</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </InfoSection>

      <InfoSection title="Who can see it">
        <p>
          Our staff see the information they need to serve you. We use trusted service providers to run GlowSync — Supabase
          (database and file storage), Vercel (website hosting), Google and Meta (sign-in), and email delivery services — who
          process data on our behalf.
        </p>
      </InfoSection>

      <InfoSection title="How long we keep it">
        <p>
          We keep your account and visit records while your account is active and as needed for business and legal records.
          You can ask us to delete your data at any time — see <Link href="/data-deletion">Data Deletion</Link>.
        </p>
      </InfoSection>

      <InfoSection title="Your rights">
        <p>
          You may access, correct or request deletion of your personal information, and object to its processing. You can
          edit most details yourself in <Link href="/my-glow/profile">My Profile</Link>.
        </p>
      </InfoSection>

      <InfoSection title="Contact us">
        <p>
          Email <a href={`mailto:${SPA_EMAIL}`}>{SPA_EMAIL}</a> or call <a href={`tel:${SPA_PHONE.replace(/\s/g, "")}`}>{SPA_PHONE}</a>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
