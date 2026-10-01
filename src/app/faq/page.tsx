import Link from "next/link";
import InfoPage, { SPA_EMAIL, SPA_PHONE } from "@/components/InfoPage";

export const metadata = { title: "FAQs — Blush Spa & Aesthetics" };

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I book an appointment?",
    a: (
      <>
        Sign in with Google or Facebook, then tap <strong>Book Now</strong>. Choose a branch, your services, a therapist
        (or &ldquo;any professional&rdquo;) and a time. You&apos;ll see your booking in <Link href="/my-glow">My Glow</Link>.
      </>
    ),
  },
  {
    q: "What payment options do you have?",
    a: (
      <>
        <strong>Pay Now</strong> — pay the booking amount by GCash and upload your receipt. Our Front Desk checks the
        payment in our GCash account, then confirms your appointment. <strong>Pay Later</strong> — reserve now and pay at
        the branch (cash or GCash) on your appointment day.
      </>
    ),
  },
  {
    q: "When is my booking confirmed?",
    a: "Our Front Desk confirms bookings as soon as possible. For Pay Now, this happens after your GCash payment is verified. You'll get a notification in the app when it's confirmed.",
  },
  {
    q: "What if I'm late?",
    a: "Please arrive on time. Bookings where the client hasn't arrived 10 minutes after the start time are marked No Show and cancelled. Contact your branch to reschedule.",
  },
  {
    q: "Can I get a refund?",
    a: "Payments are non-refundable. If you can't make it, contact your branch to reschedule — your payment carries over to the new date and time.",
  },
  {
    q: "How do I change or cancel my booking?",
    a: "Call or message your branch and our staff will help you reschedule or cancel.",
  },
  {
    q: "What are GlowPoints?",
    a: "After a completed visit you can leave a review. Helpful, genuine reviews earn GlowPoints, which you can redeem for vouchers in My Glow → My Rewards.",
  },
  {
    q: "Can walk-in clients use their account?",
    a: "Yes. Tell the Front Desk the name on your GlowSync account when you arrive and they'll link your visit, so it appears in your history and you can review it.",
  },
  {
    q: "Where are your branches?",
    a: (
      <>
        We have two branches in Pagadian City — One Cecilia Center and Robinsons Pagadian. See{" "}
        <Link href="/branches">Branches</Link> for addresses and opening hours.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <InfoPage eyebrow="Help Center" title="Frequently Asked Questions" intro="Quick answers about booking, payments and your visit.">
      <div className="space-y-3">
        {FAQS.map((f) => (
          <details key={f.q} className="group rounded-2xl border border-nude/70 bg-white p-5 shadow-sm open:shadow-md">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-ink">
              {f.q}
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-skin text-coral-dark transition group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <div className="mt-3 leading-relaxed text-ink/75 [&_a]:font-medium [&_a]:text-coral-dark [&_a]:underline">{f.a}</div>
          </details>
        ))}
      </div>
      <p className="mt-10 rounded-2xl bg-skin p-5 text-center text-ink/75">
        Still have a question? Call <a href={`tel:${SPA_PHONE.replace(/\s/g, "")}`} className="font-semibold text-coral-dark">{SPA_PHONE}</a>, email{" "}
        <a href={`mailto:${SPA_EMAIL}`} className="font-semibold text-coral-dark">{SPA_EMAIL}</a>, or{" "}
        <Link href="/feedback" className="font-semibold text-coral-dark underline">send us a message</Link>.
      </p>
    </InfoPage>
  );
}
