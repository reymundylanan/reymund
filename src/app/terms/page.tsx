import Link from "next/link";
import InfoPage, { InfoSection, SPA_EMAIL } from "@/components/InfoPage";

export const metadata = { title: "Terms of Service — Blush Spa & Aesthetics" };

export default function TermsPage() {
  return (
    <InfoPage eyebrow="The Fine Print" title="Terms of Service" intro="The rules for booking and using GlowSync." updated="October 2026">
      <InfoSection title="Bookings">
        <ul>
          <li>A booking is confirmed only when our Front Desk confirms it in GlowSync.</li>
          <li>Please give a phone number we can reach you on, and arrive on time.</li>
          <li>Bookings where the client hasn&apos;t arrived 10 minutes after the start time are marked No Show and cancelled.</li>
        </ul>
      </InfoSection>

      <InfoSection title="Payments">
        <ul>
          <li>Pay Now bookings are paid by GCash. Your booking stays pending until our Front Desk verifies the payment in our GCash account — an uploaded receipt alone is not proof of payment.</li>
          <li>Pay Later bookings are paid at the branch on your appointment day.</li>
          <li>
            <strong>Payments are non-refundable.</strong> If you can&apos;t make it, contact your branch to reschedule — the
            payment carries over to the new date and time.
          </li>
        </ul>
      </InfoSection>

      <InfoSection title="Reviews and GlowPoints">
        <ul>
          <li>Reviews must be honest and about your own visit. We may hide reviews that are abusive, unrelated or contain personal information.</li>
          <li>GlowPoints have no cash value and can only be redeemed for vouchers as shown in My Rewards.</li>
        </ul>
      </InfoSection>

      <InfoSection title="Your account">
        <p>
          Keep your sign-in secure and give accurate information. We may restrict accounts that misuse the booking system.
          See our <Link href="/privacy">Privacy Policy</Link> for how we handle your data.
        </p>
      </InfoSection>

      <InfoSection title="Questions">
        <p>
          Email <a href={`mailto:${SPA_EMAIL}`}>{SPA_EMAIL}</a> or <Link href="/feedback">send us a message</Link>.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
