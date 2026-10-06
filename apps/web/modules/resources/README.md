# modules/resources

A **resource** is one generated document: the agent output plus everything needed to open it as an activity, export it in any view of its template, and run its agent again. It is stored as a workspace document tagged `resource` (`resource.js`: `buildResource`, `parseResource`, attempts and stats).

- `ResourceDetail.js` / `ResourceExports.js` / `ResourceStyle.js` / `SaveResourceDialog.js` — the overlay a resource opens in, its downloads, its "Format & colour", and the save dialog.
- `concepts.js`, `look.js`, `outputDoc.js`, `saveFlow.js` — what it teaches, how it looks, the laid-out document, the save flow.

## Update… (run the same agent again with what the user wants changed)

- `update.js` — pure logic + `updateResource({ document, resource, instruction, material, keepFormat, workspace, useFallback, onProgress, fetchImpl })`. It resolves the agent (built-in, saved, deleted → fallback), rebuilds the run config from the saved request, runs the Iterate prompt improver, streams the generation with `refinementPrompt` + `previousOutput`, rebuilds the resource and diffs it. **Nothing is saved there.** Also: `decideMode` (replace or save as a copy), `applyUpdate`, `copyName`, `pushVersion` / `restoreVersion` (`resource.versions`, max 5), `diffResources`, `staleSources`, `dependantsOf`.
- `UpdateDialog.js` — the dialog every "Update…" button opens (form → progress with `PlanProgress` → result with `UpdateCompare` → Replace / Save as new version / Discard). Props: `document` (null for a result that is not saved yet), `resource`, `workspace`, `fallbackSubjectId`, `onSaveGeneratedQuizDocument`, `onUpdateGeneratedDocument`, `onReplaceUnsaved`, `onDone`, `onClose`.
- `UpdateCompare.js`, `VersionsPanel.js` — the before/after view and the "Versions" tab.
- The same idea for study plans lives in `modules/plans/updatePlan.js` + `UpdatePlanDialog.js` (+ `app/api/plans/update/route.js`): the model proposes, `applyPlanUpdate` enforces what may change (finished steps, built resources, deadlines with `setBy`, the plan's agent scope).
