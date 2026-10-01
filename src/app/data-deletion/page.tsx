import Link from "next/link";
import InfoPage, { InfoSection, SPA_EMAIL, SPA_PHONE } from "@/components/InfoPage";

export const metadata = { title: "Data Deletion — Blush Spa & Aesthetics" };

export default function DataDeletionPage() {
  return (
    <InfoPage
      eyebrow="Your Data"
      title="Data Deletion Instructions"
      intro="How to ask us to delete your GlowSync account and personal data, including data from Google or Facebook sign-in."
      updated="October 2026"
    >
      <InfoSection title="How to request deletion">
        <ul>
          <li>
            Email <a href={`mailto:${SPA_EMAIL}?subject=Delete%20my%20GlowSync%20account`}>{SPA_EMAIL}</a> with the subject
            &ldquo;Delete my GlowSync account&rdquo; and the name and email on your account; or
          </li>
          <li>
            <Link href="/feedback">Send us a message</Link> choosing the topic &ldquo;General&rdquo;; or
          </li>
          <li>Call <a href={`tel:${SPA_PHONE.replace(/\s/g, "")}`}>{SPA_PHONE}</a> or ask at any branch.</li>
        </ul>
        <p>We&apos;ll confirm your identity and complete the request within 30 days.</p>
      </InfoSection>

      <InfoSection title="What we delete">
        <p>
          Your account, profile details, photo, uploaded receipts and review photos. Some records — such as payment and visit
          records — may be kept in anonymised form where we need them for business or legal reasons.
        </p>
      </InfoSection>

      <InfoSection title="Signed in with Facebook?">
        <p>
          You can also remove GlowSync from your Facebook account: Facebook → Settings &amp; privacy → Settings → Apps and
          websites → GlowSync → Remove. Then contact us as above so we delete the data we hold.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
