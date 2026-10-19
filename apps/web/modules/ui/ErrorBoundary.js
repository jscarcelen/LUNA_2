"use client";

import { Component } from "react";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * Keeps one broken screen from taking the whole app with it. A crash inside (an unexpected value in a
 * quiz, a formula that cannot be drawn…) shows a short message with a way out instead of a blank page.
 */
function Fallback({ title, message, onClose, onRetry }) {
  const t = useT();
  return (
    <div role="alert" className="tw-scope mx-auto my-8 grid max-w-md gap-3 rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
      <p className="m-0 text-base font-bold text-ink">{title || t("courses.error.title")}</p>
      <p className="m-0 text-sm text-soft-ink">{message || t("courses.error.message")}</p>
      <div className="flex justify-center gap-2">
        <button type="button" className="rounded-full border border-ink/15 px-4 py-1.5 text-sm font-semibold text-ink" onClick={onRetry}>{t("courses.error.retry")}</button>
        {onClose ? <button type="button" className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white" onClick={onClose}>{t("common.close")}</button> : null}
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <Fallback title={this.props.title} message={this.props.message} onClose={this.props.onClose} onRetry={() => this.setState({ error: null })} />;
  }
}
