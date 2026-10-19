/** The merged "Ask Luna" button opens the feedback panel through this event (the panel lives in FeedbackWidget). */
export const FEEDBACK_EVENT = "luna:feedback";

export function openFeedback() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT));
}
