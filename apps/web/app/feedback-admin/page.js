import { FeedbackBoard } from "../../modules/feedback/FeedbackBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "LUNA feedback", robots: { index: false, follow: false } };

/** The owner's board for the beta feedback tool (TEMPORARY). Protected by LUNA_FEEDBACK_ADMIN_KEY inside the API. */
export default function FeedbackAdminPage() {
  return <FeedbackBoard />;
}
