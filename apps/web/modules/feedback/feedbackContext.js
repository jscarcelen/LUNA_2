/**
 * What the page the tester is on knows that the feedback should carry (beta tool, TEMPORARY).
 * A page calls `setFeedbackContext("agent", { id, name })` while it is showing and `clearFeedbackContext("agent")` when it leaves;
 * the widget reads everything with `getFeedbackContext()` when feedback is sent.
 */
const store = {};

export function setFeedbackContext(key, value) {
  if (value === undefined || value === null) delete store[key];
  else store[key] = value;
}
export const clearFeedbackContext = (key) => { delete store[key]; };
export const getFeedbackContext = () => ({ ...store });
