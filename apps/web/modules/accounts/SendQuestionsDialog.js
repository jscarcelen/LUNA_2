"use client";

import { useEffect, useRef, useState } from "react";
import { buildActivity } from "../activities/engine/activity";
import { buildResource } from "../resources/resource";
import { groundingDocumentIds, questionSetConfig } from "./sendQuestions";
import { card, ghostBtn, kicker, primaryBtn } from "./ui";
import { useT } from "../../lib/i18n/LocaleProvider.js";

/**
 * "Send 10 questions to {name}": makes a short question set on one weak topic, saves it in the teacher's own workspace
 * (as an activity) and hands it to the normal Assign dialog with the student already chosen. Nothing is sent without that
 * last step, where the teacher sets a due date.
 */
export function SendQuestionsDialog({ action, student, workspaces = [], workspaceId = "", subjectId = "", onSave, onAssign, onClose }) {
  const t = useT();
  const [state, setState] = useState({ status: "working", error: "" });
  const started = useRef(false);
  const count = Number(action?.questions) || 10;
  const name = student?.displayName || t("dialogs.questions.theStudent");

  async function run() {
    setState({ status: "working", error: "" });
    try {
      if (!workspaceId || !subjectId) throw new Error(t("dialogs.questions.needCourse"));
      const topic = String(action.topic || "").trim();
      const config = questionSetConfig({ topic, why: action.why || action.reason || "", count, workspaceId, subjectId, documentIds: groundingDocumentIds(workspaces, topic) });
      const response = await fetch("/api/ai-tools/agent-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("dialogs.questions.couldNot"));
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) throw new Error(t("dialogs.questions.none"));
      const title = topic ? t("dialogs.questions.titleTopic", { topic, name }) : t("dialogs.questions.title", { name });
      const activity = buildActivity([{ id: "items", name: "items", type: "array", children: [] }], { items }, { title });
      const payload = buildResource({
        name: title, activity,
        data: { items: activity.questions.map((question) => ({ question: question.prompt, answer: question.answer, options: question.options, explanation: question.explanation, topic: question.topic || topic })) },
        request: {},
        meta: { agentName: "Targeted practice", subjectName: "", questionCount: activity.questions.length }
      });
      const content = JSON.stringify(payload, null, 2);
      const saved = await onSave({ folderIds: [], autoFile: true, tags: ["resource", "activity", ...(topic ? [`topic:${topic}`] : [])], file: { name: `${title}.resource.json`, content, preview: t.plural("dialogs.questions.preview", activity.questions.length), sizeBytes: content.length } });
      if (!saved?.id) throw new Error(t("dialogs.questions.notSaved"));
      onAssign(saved);
    } catch (error) {
      setState({ status: "error", error: String(error.message || error) });
    }
  }
  useEffect(() => { if (started.current) return; started.current = true; run(); }, []);

  return (
    <div className="tw-scope fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={state.status === "working" ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("dialogs.questions.aria", { name })} className={`${card} w-full max-w-sm`} onClick={(event) => event.stopPropagation()}>
        <p className={kicker}>{t.plural("dialogs.questions.kicker", count, { name })}</p>
        <h3 className="m-0 mt-1 text-base font-bold text-ink">{action?.topic || t("dialogs.questions.targeted")}</h3>
        {state.status === "working" ? (
          <p className="m-0 mt-3 flex items-center gap-2 text-sm text-soft-ink" role="status"><span className="inline-block size-2 animate-pulse rounded-full bg-[var(--accent)]" />{t.plural("dialogs.questions.making", count)}</p>
        ) : (
          <>
            <p className="m-0 mt-3 text-sm text-[var(--color-danger)]" role="alert">{state.error}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={ghostBtn} onClick={onClose}>{t("common.close")}</button>
              <button type="button" className={primaryBtn} onClick={run}>{t("dialogs.questions.tryAgain")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
