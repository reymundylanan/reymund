import InfoPage from "@/components/InfoPage";
import FeedbackForm from "@/components/FeedbackForm";

export const metadata = { title: "Submit Feedback — Blush Spa & Aesthetics" };

export default function FeedbackPage() {
  return (
    <InfoPage eyebrow="We're Listening" title="Submit Feedback" intro="Compliments, suggestions or concerns — your message goes straight to our team.">
      <FeedbackForm />
    </InfoPage>
  );
}
