"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SideNav } from "./SideNav";
import { BottomTabs } from "./BottomTabs";
import { ensureSubjectStructure } from "../modules/plans/folders";
import { TopBar } from "./TopBar";
import { roleProfiles } from "./data";
import { desktopPageFor, isMobileRoot, isPageAllowed, mobileTabs, navFor, sectionOf, shortTitleOf, tabKeyOf, tabsFor, titleOf } from "./navModel";
import { SectionTabs } from "./SectionTabs";
import { friendlyMessage } from "./friendlyError";
import { FirstRunTour } from "./FirstRunTour";
import { ConnectionsPage } from "../modules/accounts/ConnectionsPage";
import { LinkedStudentsPage } from "../modules/accounts/LinkedStudentsPage";
import { PlatformNotice } from "../modules/accounts/PlatformNotice";
import { ShareDialog } from "../modules/accounts/ShareDialog";
import { SendPracticeDialog } from "../modules/accounts/SendPracticeDialog";
import { SendQuestionsDialog } from "../modules/accounts/SendQuestionsDialog";
import { accountsApi } from "../modules/accounts/api";
import { VisibilityProvider } from "../modules/accounts/VisibilityTags";
import { announceShareFinished, onLeaveRequested, onShareRequested, setSharingAvailable } from "../modules/accounts/shareEvents";
import { saveBlockToLibrary } from "../modules/template-studio/engine/blocks";
import { WorkspacePage } from "../modules/workspace";
import { DashboardPage } from "../modules/dashboard";
import { MarketplacePage } from "../modules/marketplace/MarketplacePage";
import { ActivitiesPage } from "../modules/activities/ActivitiesPage";
import { PerformancePage } from "../modules/performance/PerformancePage";
import { PlansPage } from "../modules/plans/PlansPage";
import { CreatePage, quickMakePage, AIToolRuntimePage, RunAgentPage, findAiToolById } from "../modules/ai-tools";
import { BuilderView, RevenueView } from "./views";
import { UiCritic } from "../modules/ui/UiCritic";
import { FeedbackWidget } from "../modules/feedback/FeedbackWidget";
import { AskLunaProvider } from "../modules/chat/AskLunaContext";
import { GlobalAskLuna } from "../modules/chat/GlobalAskLuna";
import { AskLunaMenu } from "../modules/chat/AskLunaMenu";
import { uploadFailureMessage } from "../modules/workspace/uploadPlan";
import { renameInResource } from "../modules/workspace/renameCascade";

import { cacheKeyFor, invalidateWorkspaces, loadWorkspaces as fetchWorkspaces, peekWorkspaces, storeWorkspaces } from "../lib/workspacesClientCache.js";
import { useT } from "../lib/i18n/LocaleProvider.js";
import { defaultSubjectId, visibleSubjects } from "../modules/ui/subjects.js";
import { isReservedSubjectName } from "../modules/accounts/shared.js";
import { MobileHome } from "../modules/mobile/MobileHome";
import { MobileStudy } from "../modules/mobile/MobileStudy";
import { MobileLibrary } from "../modules/mobile/MobileLibrary";
import { MobileProgress } from "../modules/mobile/MobileProgress";
import { useOpener } from "../modules/mobile/MobileOpener";
import { STUDENT_PHONE_QUERY } from "../modules/mobile/phone";
import { loadAllDrafts } from "../modules/activities/draftStore";
import { draftProgress } from "../modules/activities/drafts";
import { askConfirm } from "../modules/ui/dialogs.js";

const defaultPage = { student: "dashboard", teacher: "dashboard", parent: "dashboard" };
const WORKSPACES_API = "/api/workspaces-supabase";

/**
 * The app. `account` is null for the public demo (/app: sample profile, role switcher, nothing about
 * connections) and the logged-in account for the real platform (/platform: the role and name come from
 * the account, there is no role switcher, and Connections / My students are in the menu).
 */
export function AppShell({ account: accountProp = null, initialPage = "", tourSeen = null }) {
  const t = useT();
  // Saved profile changes (name, age…) replace the server-rendered account so every screen shows them at once.
  const [accountOverride, setAccountOverride] = useState(null);
  const account = accountOverride || accountProp;
  const [role, setRole] = useState(account?.role || "student");
  // `initialPage` comes from a link such as /platform?page=connections (the notification emails); only a section
  // that exists for this account's role is honoured.
  const [page, setPageState] = useState(() => {
    const start = defaultPage[account?.role || "student"];
    // Old section names (`ai-tools`, `workspaces`…) still open: the model says which role may see what.
    const known = account ? isPageAllowed(initialPage, account.role, true) : false;
    return known ? initialPage : start;
  });
  const [shareTarget, setShareTarget] = useState(null);
  // Teacher: "Send practice to {class}…" (pick what to send) and "Send 10 questions to {student}" (make, then assign).
  const [practiceTarget, setPracticeTarget] = useState(null);
  const [questionsTarget, setQuestionsTarget] = useState(null);
  const [shareNotice, setShareNotice] = useState("");
  // "Share…" opens one dialog for everything: a file/folder/topic/plan (live share with a permission) or an
  // agent/template/component (a copy). Older callers pass a bare document, which still works.
  const openShare = (target) => { if (target) setShareTarget(target.kind ? target : { kind: "document", id: target.id, name: target.name, document: target }); };
  useEffect(() => {
    if (!account) return undefined;
    setSharingAvailable(true);
    const stop = onShareRequested(openShare);
    const stopLeave = onLeaveRequested(async (grantId) => {
      if (!(await askConfirm({ message: t("shell.leaveConfirm"), confirmLabel: t("common.leave"), danger: true }))) return;
      const result = await accountsApi.leaveGrant(grantId);
      setShareNotice(result.ok ? t("shell.leftShare") : result.error);
      if (result.ok) loadWorkspaces();
    });
    return () => { stop(); stopLeave(); setSharingAvailable(false); };
  }, [account?.id]);
  // Components other people shared with you are delivered as copies: import them into the local library once.
  useEffect(() => {
    if (!account) return undefined;
    let alive = true;
    (async () => {
      const pending = await accountsApi.pendingComponents();
      const list = pending.ok ? pending.data.components || [] : [];
      if (!alive || !list.length) return;
      let imported = 0;
      for (const entry of list) {
        try { saveBlockToLibrary(entry.block); imported += 1; } catch { /* a block that cannot be stored is skipped */ }
      }
      await accountsApi.markComponentsImported(list.map((entry) => entry.id));
      const names = [...new Set(list.map((entry) => entry.sender?.displayName).filter(Boolean))];
      if (alive && imported) setShareNotice(t.plural("shell.componentsAdded", imported, { names: names.join(", ") || t("shell.yourNetwork") }));
    })();
    return () => { alive = false; };
  }, [account?.id]);
  // Exam dates teachers and parents sent to this student ("Dates from my teachers": Home, Study plans). Students of the
  // real platform only; reloaded whenever the page changes (cheap), and after hiding one or linking a plan.
  const [examDates, setExamDates] = useState([]);
  const loadExamDates = useCallback(async () => {
    if (account?.role !== "student") return;
    const result = await accountsApi.examDates();
    if (result.ok) setExamDates(result.data.examDates || []);
  }, [account?.id, account?.role]);
  useEffect(() => { loadExamDates(); }, [loadExamDates, page]);
  const dismissExamDate = useCallback(async (entry, hide) => {
    const result = hide ? await accountsApi.dismissExamDate(entry.id) : await accountsApi.restoreExamDate(entry.id);
    if (result.ok) setExamDates(result.data.examDates || []);
  }, []);
  const profileName = account ? account.displayName : (roleProfiles[role]?.name || "");
  // Every move to another page is a history entry, so the browser's Back button (and an iPhone swipe)
  // returns to the page you were on instead of leaving the app.
  const pageRef = useRef(page);
  pageRef.current = page;
  function setPage(next) {
    const value = typeof next === "function" ? next(pageRef.current) : next;
    if (!value || value === pageRef.current) return;
    try { window.history.pushState({ lunaPage: value }, ""); } catch { /* history unavailable */ }
    pageRef.current = value;
    setPageState(value);
  }
  // Stable for the "Who can see my things?" card (it only ever opens People).
  const openPageStable = useCallback((target) => setPage(target), []);
  useEffect(() => {
    try { window.history.replaceState({ ...(window.history.state || {}), lunaPage: pageRef.current }, ""); } catch { /* history unavailable */ }
    function onPop(event) {
      const target = event.state?.lunaPage;
      if (target) { pageRef.current = target; setPageState(target); setMenuOpen(false); }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // The tree is cached in memory (stale-while-revalidate, one shared request): a remount or a second consumer paints at once.
  const workspacesKey = cacheKeyFor(account);
  const [workspaces, setWorkspaces] = useState(() => peekWorkspaces(cacheKeyFor(account)) || []);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Loading workspaces...");
  const [isWorking, setIsWorking] = useState(false);
  const [blockTemplates, setBlockTemplates] = useState([]);

  const currentAiToolId = page.startsWith("ai-tool:") ? page.replace("ai-tool:", "").split("?")[0] : "";
  const currentAiTool = currentAiToolId ? findAiToolById(currentAiToolId) : null;
  const currentCustomAgentId = page.startsWith("custom-agent:") ? page.replace("custom-agent:", "").split("?")[0] : "";
  // "ai-tool:quiz-generator?docs=a,b" opens a tool with that material already chosen (Quick make, "Make a quiz" on a document).
  const presetDocumentIds = page.includes("?docs=") ? decodeURIComponent(page.split("?docs=")[1] || "").split(",").map((id) => id.trim()).filter(Boolean) : [];
  const resumeResourceDocumentId = page.includes("?resource=") ? page.split("?resource=")[1] : "";
  const editAgentDocumentId = page.startsWith("agent-edit:") ? page.replace("agent-edit:", "") : "";
  // Template Studio is reachable as its own section ("templates?open=…") and, for older links, as a tool.
  const openTemplateId = page.includes("?open=") ? page.split("?open=")[1] : "";
  // "workspaces?doc=<id>" opens the folder browser on one document (from a plan step, say).
  const openDocumentId = page.startsWith("workspaces?doc=") ? page.split("?doc=")[1] : "";
  // "plans?open=<id>" opens one plan (from Home); "plans?generate=1" opens "Plan it for me".
  const planParams = page.startsWith("plans?") ? new URLSearchParams(page.split("?")[1]) : null;
  const openPlanId = planParams?.get("open") || "";
  const startGenerating = Boolean(planParams?.get("generate"));
  const startExamDateId = planParams?.get("exam") || "";
  const startDocumentIds = (planParams?.get("docs") || "").split(",").map((id) => id.trim()).filter(Boolean);
  const title = titleOf(page, role, currentAiTool ? currentAiTool.name : "", t);
  const shortTitle = currentAiTool ? t("nav.short.make") : shortTitleOf(page, role, t);
  const navItems = navFor(role, Boolean(account), t);
  // A student on a phone gets the phone app (four tabs, its own Home / Study / Library / Progress, modules/mobile);
  // everyone else, and every larger screen, gets the website. `null` until the screen size is known, so no page is
  // redirected too early.
  const [phone, setPhone] = useState(null);
  useEffect(() => {
    const media = window.matchMedia(STUDENT_PHONE_QUERY);
    const sync = () => setPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const mobileStudent = phone === true && role === "student";
  const currentWorkspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) || workspaces[0] || null;
  // Quizzes started and not handed in ("Continue learning", "In progress"): { activity document id → { answered, total } }.
  const [drafts, setDrafts] = useState({});
  const refreshDrafts = useCallback(() => {
    loadAllDrafts().then((all) => setDrafts(Object.fromEntries([...all.entries()].map(([key, draft]) => [key, draftProgress(draft)]).filter(([, value]) => value && value.answered)))).catch(() => {});
  }, []);
  useEffect(() => { if (mobileStudent && isMobileRoot(page)) refreshDrafts(); }, [mobileStudent, page, refreshDrafts]);
  // "study" and "library" are the phone app's pages; on a larger screen they open the website page that holds the same things.
  useEffect(() => {
    if (phone === null || mobileStudent) return;
    const alias = desktopPageFor(page);
    if (alias === page) return;
    pageRef.current = alias;
    setPageState(alias);
    try { window.history.replaceState({ ...(window.history.state || {}), lunaPage: alias }, ""); } catch { /* history unavailable */ }
  }, [phone, mobileStudent, page]);
  /** What the side rail and section tabs hold that a phone student reaches from the profile menu instead. */
  const phoneMoreLinks = mobileStudent ? [
    { label: t("mobile.more.make"), page: "create" },
    { label: t("mobile.more.plans"), page: "plans" },
    { label: t("mobile.more.practice"), page: "activities" },
    { label: t("mobile.more.courses"), page: "workspaces" },
    { label: t("mobile.more.browse"), page: "marketplace" }
  ] : [];
  const section = sectionOf(page);
  const sectionTabs = tabsFor(section, role, Boolean(account), t);

  useEffect(() => {
    // Fresh enough (loaded in the last seconds, e.g. a remount) is not asked again; otherwise stale-while-revalidate.
    loadWorkspaces({ force: false });
  }, []);

  // Study plans, Practice and Progress read your own topics: a shared one ("Shared documents", "Shared with me")
  // picked in Courses gives way to your first own topic when you open them.
  useEffect(() => {
    if (!/^(plans|activities|performance)/.test(page)) return;
    const subjects = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.subjects || [];
    const selected = subjects.find((subject) => subject.id === selectedSubjectId);
    if (selected && isReservedSubjectName(selected.name) && visibleSubjects(subjects).length) setSelectedSubjectId(defaultSubjectId(subjects));
  }, [page, workspaces, selectedWorkspaceId, selectedSubjectId]);

  function selectFallback(workspaceList) {
    const firstWorkspace = workspaceList[0];
    setSelectedWorkspaceId(firstWorkspace?.id || "");
    setSelectedSubjectId(defaultSubjectId(firstWorkspace?.subjects));
  }

  async function loadWorkspaces({ force = true } = {}) {
    try {
      // Show the cached tree straight away; the request refreshes it behind (and is shared with any other caller).
      const cached = peekWorkspaces(workspacesKey);
      if (cached) setWorkspaces(cached); else setIsWorking(true);
      const list = await fetchWorkspaces(workspacesKey, { force });
      setWorkspaces(list);
      if (!selectedWorkspaceId && list.length) {
        const firstWorkspace = list[0];
        setSelectedWorkspaceId(firstWorkspace.id);
        setSelectedSubjectId(defaultSubjectId(firstWorkspace.subjects));
      }
      setStatusMessage("");
    } catch (error) {
      setStatusMessage(`Load failed: ${String(error.message || error)}`);
    } finally {
      setIsWorking(false);
    }
  }

  async function postWorkspaceAction(action, payload) {
    try {
      setIsWorking(true);
      const response = await fetch(WORKSPACES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload })
      });
      // The host answers some failures (a too-large request) in plain text: read the body as text first.
      const raw = await response.text();
      let data;
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: uploadFailureMessage(response.status, raw) }; }
      if (!response.ok && !data.error) data.error = uploadFailureMessage(response.status, raw);
      if (response.ok) {
        if (Array.isArray(data.workspaces)) {
          storeWorkspaces(workspacesKey, data.workspaces);
          setWorkspaces(data.workspaces);
        } else {
          invalidateWorkspaces(workspacesKey);
        }
        setStatusMessage("");
        return { ok: true, status: response.status, data };
      }
      setStatusMessage(friendlyMessage(data.error, response.status));
      return { ok: false, status: response.status, data };
    } catch (error) {
      setStatusMessage(friendlyMessage(String(error.message || error), 0));
      return { ok: false, status: 500, data: { error: String(error.message || error) } };
    } finally {
      setIsWorking(false);
    }
  }

  async function runWorkspaceAction(action, payload, options = {}) {
    const result = await postWorkspaceAction(action, payload);
    if (!result.ok) return null;

    if (options.selectWorkspaceId) {
      setSelectedWorkspaceId(options.selectWorkspaceId);
    }
    if (Object.prototype.hasOwnProperty.call(options, "selectSubjectId")) {
      setSelectedSubjectId(options.selectSubjectId || "");
    }

    return result.data;
  }

  const [openerOverlay, openItem] = useOpener({
    workspace: currentWorkspace,
    profileName,
    onSaveGeneratedQuizDocument: handleSaveGeneratedQuizDocument,
    onUpdateGeneratedDocument: handleUpdateGeneratedDocument,
    onDownloadDocument: handleDownloadDocument,
    onUpdateDocumentContent: handleUpdateDocumentContent,
    onClosed: refreshDrafts
  });

  const content = useMemo(() => {
    if (mobileStudent && isMobileRoot(page)) {
      const [base, query = ""] = page.split("?");
      const params = new URLSearchParams(query);
      const shared = { workspace: currentWorkspace, loading: isWorking || statusMessage === "Loading workspaces...", drafts, onOpen: openItem, onOpenPage: (target) => setPage(target) };
      if (base === "dashboard") return <MobileHome {...shared} profileName={profileName} examDates={examDates} />;
      if (base === "study") return <MobileStudy key={page} {...shared} initialView={params.get("view") || ""} />;
      if (base === "library") return <MobileLibrary key={page} {...shared} startAdding={params.get("add") === "1"} selectedSubjectId={selectedSubjectId} onUpload={handleUploadTxt} onCreateSubject={handleCreateSubject} onCreateFolder={handleCreateFolder} />;
      if (base === "performance") return <MobileProgress {...shared} />;
    }
    const home = (
      <DashboardPage
        role={role}
        profileName={profileName}
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        loading={isWorking}
        onOpenPlan={({ documentId, subjectId }) => { if (subjectId) setSelectedSubjectId(subjectId); setPage(`plans?open=${documentId}`); }}
        onOpenPage={(target) => setPage(target)}
        examDates={examDates}
        onDismissExamDate={dismissExamDate}
        account={Boolean(account)}
        onSendPractice={(target) => setPracticeTarget(target)}
      />
    );
    if (page === "dashboard") return home;
    // The real platform only: connections to other accounts, and a connected student's performance.
    if (account && page === "connections") return <ConnectionsPage account={account} onOpenPage={setPage} />;
    if (account && (page === "students" || page.startsWith("students?")) && role !== "student") return <LinkedStudentsPage key={page} account={account} workspaces={workspaces} onOpenPage={setPage} onOpenPlan={({ documentId, subjectId }) => { if (subjectId) setSelectedSubjectId(subjectId); setPage(`plans?open=${documentId}`); }} onOpenDocument={(documentId) => setPage(`workspaces?doc=${documentId}`)} initialGroupId={new URLSearchParams(page.split("?")[1] || "").get("group") || ""} initialTab={new URLSearchParams(page.split("?")[1] || "").get("tab") || ""} onSendQuestions={(action, student) => setQuestionsTarget({ action, student })} />;
    if (page === "performance") {
      return (
        <PerformancePage
          role={role}
          profileName={profileName}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
          onSaveGeneratedQuizDocument={handleSaveGeneratedQuizDocument}
          onUpdateGeneratedDocument={handleUpdateGeneratedDocument}
          onRemoveDocument={handleRemoveDocument}
          onOpenPage={(target) => setPage(target)}
          onSelectSubject={handleSelectSubject}
        />
      );
    }
    // Generated resources live in the workspace folders now; old links land there.
    if (page === "resources") {
      setTimeout(() => setPage("workspaces"), 0);
      return null;
    }
    if (page === "activities") {
      return (
        <ActivitiesPage
          onCreateSubject={handleCreateSubject}
          role={role}
          profileName={profileName}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
          onSaveGeneratedQuizDocument={handleSaveGeneratedQuizDocument}
          onUpdateGeneratedDocument={handleUpdateGeneratedDocument}
          onUpdateDocumentMeta={handleUpdateDocumentMeta}
          onRemoveDocument={handleRemoveDocument}
          onOpenTool={(target) => setPage(target)}
          onSelectSubject={handleSelectSubject}
          onUploadTxt={handleUploadTxt}
        />
      );
    }
    if (page === "workspaces" || page.startsWith("workspaces?")) {
      return (
        <WorkspacePage
          focusDocumentId={openDocumentId}
          templates={blockTemplates}
          onDownloadDocument={handleDownloadDocument}
          onUpdateGeneratedDocument={handleUpdateGeneratedDocument}
          onSaveGeneratedQuizDocument={handleSaveGeneratedQuizDocument}
          onCreateWorkspaceFolder={handleCreateSubject}
          onRegenerateResource={(documentId) => {
            const resourceDocument = (workspaces.flatMap((w) => w.subjects || []).flatMap((s) => s.documents || [])).find((d) => d.id === documentId);
            let agentId = "";
            try { agentId = JSON.parse(String(resourceDocument?.content || "{}"))?.meta?.agentId || ""; } catch { agentId = ""; }
            setPage(agentId ? `custom-agent:${agentId}?resource=${documentId}` : "create");
          }}
          onSelectFolder={(node) => { if (node?.subjectId && node.subjectId !== selectedSubjectId) setSelectedSubjectId(node.subjectId); }}
          role={role}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
          statusMessage={statusMessage}
          isWorking={isWorking}
          onSelectWorkspace={handleSelectWorkspace}
          onSelectSubject={handleSelectSubject}
          onCreateWorkspace={handleCreateWorkspace}
          onRenameWorkspace={handleRenameWorkspace}
          onSetWorkspaceColor={handleSetWorkspaceColor}
          onRemoveWorkspace={handleRemoveWorkspace}
          onCreateSubject={handleCreateSubject}
          onRenameSubject={handleRenameSubject}
          onSetSubjectColor={handleSetSubjectColor}
          onRemoveSubject={handleRemoveSubject}
          onCreateFolder={handleCreateFolder}
          onMoveFolder={handleMoveFolder}
          onMoveDocuments={handleMoveDocuments}
          onAddTopicTag={handleAddTopicTag}
          onRenameFolder={handleRenameFolder}
          onRemoveFolder={handleRemoveFolder}
          onRenameTopicTag={handleRenameTopicTag}
          onRemoveTopicTag={handleRemoveTopicTag}
          onSetTopicTagColor={handleSetTopicTagColor}
          onUploadTxt={handleUploadTxt}
          onRenameDocument={handleRenameDocument}
          onRemoveDocument={handleRemoveDocument}
          onUpdateDocumentMeta={handleUpdateDocumentMeta}
          onUpdateDocumentContent={handleUpdateDocumentContent}
          onListDocumentBlockTemplates={handleListDocumentBlockTemplates}
          onSaveDocumentBlockTemplate={handleSaveDocumentBlockTemplate}
          onDeleteDocumentBlockTemplate={handleDeleteDocumentBlockTemplate}
          onReviewDocumentExtraction={handleReviewDocumentExtraction}
          onReprocessDocument={handleReprocessDocument}
          onShareDocument={account ? openShare : undefined}
          onMakeFrom={(toolId, documentIds) => setPage(quickMakePage(toolId, documentIds))}
          onPlanFrom={(documentIds) => setPage(`plans?generate=1&docs=${documentIds.map(encodeURIComponent).join(",")}`)}
        />
      );
    }
    if (page === "plans" || page.startsWith("plans?")) {
      return (
        <PlansPage
          onCreateSubject={handleCreateSubject}
          onShareDocument={account ? openShare : undefined}
          onUpdateDocumentMeta={handleUpdateDocumentMeta}
          onCreateFolder={handleCreateFolder}
          onRemoveFolder={handleRemoveFolder}
          role={role}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
          onSaveGeneratedQuizDocument={handleSaveGeneratedQuizDocument}
          onUpdateGeneratedDocument={handleUpdateGeneratedDocument}
          onRemoveDocument={handleRemoveDocument}
          onOpenResource={(documentId) => setPage(documentId ? `workspaces?doc=${documentId}` : "workspaces")}
          onDownloadDocument={handleDownloadDocument}
          onUpdateDocumentContent={handleUpdateDocumentContent}
          onSelectSubject={handleSelectSubject}
          openPlanId={openPlanId}
          startGenerating={startGenerating}
          startDocumentIds={startDocumentIds}
          startExamDateId={startExamDateId}
          examDates={examDates}
          onDismissExamDate={dismissExamDate}
          onLinkPlanToExamDate={async (examDateId, planDocumentId) => {
            const result = await accountsApi.linkPlanToExamDate(examDateId, planDocumentId);
            if (result.ok) { setExamDates(result.data.examDates || []); await loadWorkspaces(); }
            return result;
          }}
        />
      );
    }
    if (page === "templates" || page.startsWith("templates?")) {
      // Templates are their own section of the app, not an AI tool.
      const studio = findAiToolById("template-builder");
      const Studio = studio.component;
      return (
        <Studio
          toolContext={{
            openTemplateId,
            workspaces,
            selectedWorkspaceId,
            selectedSubjectId,
            onOpenTool: (toolId) => setPage(`ai-tool:${toolId}`),
            onListDocumentBlockTemplates: handleListDocumentBlockTemplates,
            onSaveDocumentBlockTemplate: handleSaveDocumentBlockTemplate,
            onDeleteDocumentBlockTemplate: handleDeleteDocumentBlockTemplate
          }}
        />
      );
    }
    if (page === "ai-tools" || page === "create") {
      return (
        <CreatePage
          role={role}
          onOpenTool={(toolId) => setPage(`ai-tool:${toolId}`)}
          onOpenCustomAgent={(documentId) => setPage(`custom-agent:${documentId}`)}
          onEditAgent={(documentId) => setPage(`agent-edit:${documentId}`)}
          onDeleteAgent={handleRemoveDocument}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
        />
      );
    }
    const editorTool = editAgentDocumentId ? findAiToolById("agent-builder") : null;
    if (currentAiTool || editorTool) {
      const activeTool = currentAiTool || editorTool;
      const ToolComponent = activeTool.component;
      return (
        <AIToolRuntimePage title={activeTool.name} description={activeTool.description} onBack={() => setPage("create")}>
          <ToolComponent
            toolContext={{
              editAgentDocumentId,
              presetDocumentIds,
              openTemplateId,
              workspaces,
              selectedWorkspaceId,
              selectedSubjectId,
              onUploadTxt: handleUploadTxt,
              onOpenTool: (toolId) => setPage(`ai-tool:${toolId}`),
              onOpenPage: (target) => setPage(target),
              onReviewDocumentExtraction: handleReviewDocumentExtraction,
              onSaveGeneratedQuizDocument: handleSaveGeneratedQuizDocument,
              onUpdateGeneratedDocument: handleUpdateGeneratedDocument,
              onCreateFolder: handleCreateFolder,
                  onListDocumentBlockTemplates: handleListDocumentBlockTemplates,
                  onSaveDocumentBlockTemplate: handleSaveDocumentBlockTemplate,
                  onDeleteDocumentBlockTemplate: handleDeleteDocumentBlockTemplate
            }}
          />
        </AIToolRuntimePage>
      );
    }
    if (currentCustomAgentId) {
      return (
        <AIToolRuntimePage title="Run Agent" description="Generate output with your saved agent." onBack={() => setPage("create")}>
          <RunAgentPage
            agentDocumentId={currentCustomAgentId}
            toolContext={{
              workspaces,
              selectedWorkspaceId,
              selectedSubjectId,
              onSaveGeneratedQuizDocument: handleSaveGeneratedQuizDocument,
              onUpdateGeneratedDocument: handleUpdateGeneratedDocument,
              onListDocumentBlockTemplates: handleListDocumentBlockTemplates,
              onCreateFolder: handleCreateFolder,
              resumeResourceDocumentId,
              presetDocumentIds,
              onOpenPage: (target) => setPage(target),
              onOpenTool: (toolId) => setPage(`ai-tool:${toolId}`)
            }}
          />
        </AIToolRuntimePage>
      );
    }
    if (page === "marketplace") {
      return (
        <MarketplacePage
          role={role}
          isMinor={Boolean(account?.isMinor)}
          profileName={profileName}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
          templates={blockTemplates}
          onGoBuilder={() => setPage("ai-tool:agent-builder")}
          onInstallAgent={async (listing) => {
            const content = JSON.stringify({ ...(listing.payload || {}), installedFrom: { listingId: listing.id, storeId: listing.storeId } }, null, 2);
            await handleSaveGeneratedQuizDocument({ folderIds: [], tags: ["ai-agent"], file: { name: `${listing.name}.agent.json`, content, sizeBytes: content.length } });
          }}
          onInstallTemplate={async (listing) => {
            await handleSaveDocumentBlockTemplate({ ...(listing.payload || {}), id: "", name: listing.name });
            setBlockTemplates(await handleListDocumentBlockTemplates());
          }}
          onInstallResource={async (listing) => {
            // A plan arrives with its schedule; a resource with its activity. Both become documents.
            const isPlan = listing.kind === "plan";
            const content = JSON.stringify(listing.payload || {}, null, 2);
            await handleSaveGeneratedQuizDocument({
              folderIds: [],
              tags: isPlan ? ["study-plan"] : ["resource", ...(listing.payload?.activity ? ["activity"] : [])],
              file: { name: `${listing.name}.${isPlan ? "plan" : "resource"}.json`, content, sizeBytes: content.length }
            });
          }}
        />
      );
    }
    if (page === "builder") return <BuilderView />;
    if (page === "revenue") return <RevenueView />;
    return home;
  }, [page, role, currentAiTool, currentCustomAgentId, editAgentDocumentId, openTemplateId, workspaces, selectedWorkspaceId, selectedSubjectId, statusMessage, isWorking, examDates, mobileStudent, drafts, openItem]);

  function handleSelectWorkspace(workspaceId) {
    setSelectedWorkspaceId(workspaceId);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    setSelectedSubjectId(defaultSubjectId(workspace?.subjects));
  }

  function handleSelectSubject(subjectId) {
    setSelectedSubjectId(subjectId);
  }

  async function handleCreateWorkspace(name) {
    const result = await runWorkspaceAction("createWorkspace", { name });
    if (result?.created?.id) {
      setSelectedWorkspaceId(result.created.id);
      setSelectedSubjectId("");
    }
  }

  async function handleRenameWorkspace(workspaceId, nextName) {
    if (!workspaceId) return;
    await runWorkspaceAction("renameWorkspace", { workspaceId, nextName });
  }

  async function handleSetWorkspaceColor(workspaceId, color) {
    if (!workspaceId) return;
    await runWorkspaceAction("setWorkspaceColor", { workspaceId, color });
  }

  async function handleRemoveWorkspace(workspaceId) {
    if (!workspaceId) return;
    const result = await postWorkspaceAction("removeWorkspace", { workspaceId, force: false });
    if (result.ok) {
      if (workspaceId === selectedWorkspaceId) {
        selectFallback(result.data.workspaces || []);
      }
      return;
    }

    if (result.status === 409 && result.data?.requiresForce) {
      const c = result.data.cascade || {};
      const message = `Workspace has ${c.subjects || 0} subjects, ${c.folders || 0} folders, ${c.topicTags || 0} topic tags, and ${c.documents || 0} documents. Force delete?`;
      if (!(await askConfirm({ message, confirmLabel: t("common.delete"), danger: true }))) return;
      const forced = await postWorkspaceAction("removeWorkspace", { workspaceId, force: true });
      if (forced.ok && workspaceId === selectedWorkspaceId) {
        selectFallback(forced.data.workspaces || []);
      }
    }
  }

  // Moves a folder (and everything in it) under another folder, or to the root of any topic of the workspace.
  // Returns what moved ({ folders, documents, name, renamed, notes, previous... }), or { error } when it was refused.
  async function handleMoveFolder(folderId, newParentFolderId, options = {}) {
    if (!folderId) return null;
    const result = await postWorkspaceAction("moveFolder", {
      workspaceId: selectedWorkspaceId,
      folderId,
      newParentFolderId: newParentFolderId || "",
      targetSubjectId: options.targetSubjectId || "",
      nextName: options.nextName || ""
    });
    return result.ok ? result.data.moved || null : { error: String(result.data?.error || "The move did not go through.") };
  }

  // Moves documents (ids stay the same) to a folder, or the root of a topic, of the workspace.
  async function handleMoveDocuments(documentIds, options = {}) {
    const ids = (Array.isArray(documentIds) ? documentIds : [documentIds]).filter(Boolean);
    if (!ids.length) return null;
    const result = await postWorkspaceAction("moveDocument", {
      workspaceId: selectedWorkspaceId,
      documentIds: ids,
      targetSubjectId: options.targetSubjectId || "",
      targetFolderId: options.targetFolderId || "",
      targetFolderIds: Array.isArray(options.targetFolderIds) ? options.targetFolderIds : []
    });
    return result.ok ? result.data.moved || null : { error: String(result.data?.error || "The move did not go through.") };
  }

  async function handleCreateSubject(name) {
    if (!selectedWorkspaceId) return;
    const result = await runWorkspaceAction("createSubject", {
      workspaceId: selectedWorkspaceId,
      name
    });
    if (result?.created?.id) {
      setSelectedSubjectId(result.created.id);
      // Every topic starts with the same folders: Uploaded material, and Generated material (Study plans, Resources not in study plans).
      try { await ensureSubjectStructure({ folders: [], subjectId: result.created.id, onCreateFolder: handleCreateFolder }); } catch { /* the topic exists; the folders are made the next time they are needed */ }
    }
    return result?.created || null;
  }

  async function handleRenameSubject(subjectId, nextName) {
    if (!selectedWorkspaceId || !subjectId) return;
    await runWorkspaceAction("renameSubject", {
      workspaceId: selectedWorkspaceId,
      subjectId,
      nextName
    });
  }

  async function handleSetSubjectColor(subjectId, color) {
    if (!selectedWorkspaceId || !subjectId) return;
    await runWorkspaceAction("setSubjectColor", {
      workspaceId: selectedWorkspaceId,
      subjectId,
      color
    });
  }

  async function handleRemoveSubject(subjectId) {
    if (!selectedWorkspaceId || !subjectId) return;
    const result = await postWorkspaceAction("removeSubject", {
      workspaceId: selectedWorkspaceId,
      subjectId,
      force: false
    });
    if (result.ok) {
      if (subjectId === selectedSubjectId) {
        const workspace = (result.data.workspaces || []).find((item) => item.id === selectedWorkspaceId);
        setSelectedSubjectId(defaultSubjectId(workspace?.subjects));
      }
      return;
    }

    if (result.status === 409 && result.data?.requiresForce) {
      const c = result.data.cascade || {};
      const message = `Subject has ${c.folders || 0} folders, ${c.topicTags || 0} topic tags, and ${c.documents || 0} documents. Force delete?`;
      if (!(await askConfirm({ message, confirmLabel: t("common.delete"), danger: true }))) return;
      const forced = await postWorkspaceAction("removeSubject", {
        workspaceId: selectedWorkspaceId,
        subjectId,
        force: true
      });
      if (forced.ok && subjectId === selectedSubjectId) {
        const workspace = (forced.data.workspaces || []).find((item) => item.id === selectedWorkspaceId);
        setSelectedSubjectId(defaultSubjectId(workspace?.subjects));
      }
    }
  }

  // `subjectId` lets the folder browser act on any top-level folder, not only the selected one.
  async function handleCreateFolder(name, parentFolderId, subjectId) {
    if (!selectedWorkspaceId || !(subjectId || selectedSubjectId)) return;
    const result = await runWorkspaceAction("createFolder", {
      workspaceId: selectedWorkspaceId,
      subjectId: subjectId || selectedSubjectId,
      name,
      parentFolderId: parentFolderId || ""
    });
    return result?.created || null;
  }

  async function handleAddTopicTag(tag) {
    if (!selectedWorkspaceId || !selectedSubjectId) return;
    await runWorkspaceAction("addTopicTag", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      tag
    });
  }

  async function handleRenameFolder(folderId, nextName, subjectId) {
    if (!selectedWorkspaceId || !(subjectId || selectedSubjectId)) return;
    await runWorkspaceAction("renameFolder", {
      workspaceId: selectedWorkspaceId,
      subjectId: subjectId || selectedSubjectId,
      folderId,
      nextName
    });
  }

  async function handleRemoveFolder(folderId, subjectId) {
    if (!selectedWorkspaceId || !(subjectId || selectedSubjectId)) return;
    await runWorkspaceAction("removeFolder", {
      workspaceId: selectedWorkspaceId,
      subjectId: subjectId || selectedSubjectId,
      folderId
    });
  }

  async function handleRenameTopicTag(prevTag, nextTag) {
    if (!selectedWorkspaceId || !selectedSubjectId) return;
    await runWorkspaceAction("renameTopicTag", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      prevTag,
      nextTag
    });
  }

  async function handleRemoveTopicTag(tag) {
    if (!selectedWorkspaceId || !selectedSubjectId) return;
    await runWorkspaceAction("removeTopicTag", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      tag
    });
  }

  async function handleSetTopicTagColor(tag, color) {
    if (!selectedWorkspaceId || !selectedSubjectId || !tag) return;
    await runWorkspaceAction("setTopicTagColor", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      tag,
      color
    });
  }

  async function handleUploadTxt(files, options) {
    if (!selectedWorkspaceId || !selectedSubjectId) return;

    const readFiles = files.map(async (file) => {
      const contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          const commaIndex = dataUrl.indexOf(",");
          resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : "");
        };
        reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      return {
        name: file.name,
        sizeBytes: Number(file.size || 0),
        mimeType: file.type || "application/octet-stream",
        contentBase64,
        relativePath: file.webkitRelativePath || ""
      };
    });

    const documents = await Promise.all(readFiles);
    const uploadResult = await postWorkspaceAction("uploadDocuments", {
      workspaceId: selectedWorkspaceId,
      subjectId: options?.subjectId || selectedSubjectId,
      folderIds: Array.isArray(options?.folderIds) ? options.folderIds : [],
      tags: options?.tags || [],
      quality: options?.quality || {},
      files: documents
    });

    if (!uploadResult.ok) {
      const error = new Error(uploadResult.data?.error || "Upload failed");
      error.qualityReport = uploadResult.data?.qualityReport || null;
      error.status = uploadResult.status;
      throw error;
    }

    return uploadResult.data;
  }

  /** The original file for uploaded material, or the stored file for a generated document. */
  async function handleDownloadDocument(documentDescriptor, format = "") {
    const documentId = typeof documentDescriptor === "string" ? documentDescriptor : documentDescriptor?.id;
    if (!documentId) return null;
    const generated = typeof documentDescriptor === "object" && documentDescriptor?.sourceType === "generated";
    const result = await postWorkspaceAction(generated ? "downloadGeneratedDocument" : "downloadUploadedDocument", { documentId, format });
    return result.ok ? result.data?.download || null : null;
  }

  async function handleRenameDocument(documentId, nextName, subjectId) {
    if (!selectedWorkspaceId || !(subjectId || selectedSubjectId)) return;
    const before = workspaces.flatMap((workspace) => workspace.subjects || []).flatMap((subject) => subject.documents || []);
    const previousName = before.find((entry) => entry.id === documentId)?.name || "";
    const done = await runWorkspaceAction("renameDocument", {
      workspaceId: selectedWorkspaceId,
      subjectId: subjectId || selectedSubjectId,
      documentId,
      nextName
    });
    if (!done) return;
    // Generated material (master documents, study plans) keeps the document's name: carry the new one there too.
    for (const subject of workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.subjects || []) {
      for (const candidate of subject.documents || []) {
        if (candidate.sourceType !== "generated" || candidate.id === documentId) continue;
        const content = renameInResource(String(candidate.content || ""), { id: documentId, from: previousName, to: nextName });
        if (content) await handleUpdateGeneratedDocument(candidate.id, { file: { name: candidate.name, content, preview: candidate.preview, sizeBytes: content.length } }, subject.id);
      }
    }
  }

  async function handleRemoveDocument(documentId, subjectId) {
    if (!selectedWorkspaceId || !(subjectId || selectedSubjectId)) return;
    await runWorkspaceAction("removeDocument", {
      workspaceId: selectedWorkspaceId,
      subjectId: subjectId || selectedSubjectId,
      documentId
    });
  }

  async function handleUpdateDocumentMeta(documentId, options = {}, subjectId) {
    if (!selectedWorkspaceId || !(subjectId || selectedSubjectId) || !documentId) return;
    await runWorkspaceAction("updateDocumentMeta", {
      workspaceId: selectedWorkspaceId,
      subjectId: subjectId || selectedSubjectId,
      documentId,
      folderIds: Array.isArray(options.folderIds) ? options.folderIds : [],
      tags: Array.isArray(options.tags) ? options.tags : []
    });
  }

  async function handleUpdateDocumentContent(documentId, options = {}) {
    const targetSubjectId = options?.subjectId || selectedSubjectId;
    if (!selectedWorkspaceId || !targetSubjectId || !documentId) return null;
    const payload = {
      workspaceId: selectedWorkspaceId,
      subjectId: targetSubjectId,
      documentId,
      correctedHtml: typeof options.correctedHtml === "string" ? options.correctedHtml : "",
      correctedContent: typeof options.correctedContent === "string" ? options.correctedContent : ""
    };

    if (Object.prototype.hasOwnProperty.call(options || {}, "contentTemplateId")) {
      payload.contentTemplateId = typeof options.contentTemplateId === "string" ? options.contentTemplateId : "";
    }
    if (Object.prototype.hasOwnProperty.call(options || {}, "contentBlocksJson")) {
      payload.contentBlocksJson = options.contentBlocksJson;
    }
    if (Object.prototype.hasOwnProperty.call(options || {}, "contentBlocksSchemaVersion")) {
      payload.contentBlocksSchemaVersion = typeof options.contentBlocksSchemaVersion === "string" ? options.contentBlocksSchemaVersion : "";
    }

    const result = await runWorkspaceAction("updateDocumentContent", {
      ...payload
    });

    return result?.updated || null;
  }

  async function handleReviewDocumentExtraction(documentId, options = {}) {
    const targetSubjectId = options?.subjectId || selectedSubjectId;
    if (!selectedWorkspaceId || !targetSubjectId || !documentId) return null;
    const result = await runWorkspaceAction("reviewDocumentExtraction", {
      workspaceId: selectedWorkspaceId,
      subjectId: targetSubjectId,
      documentId,
      decision: options?.decision || "approved",
      correctedContent: typeof options?.correctedContent === "string" ? options.correctedContent : "",
      correctedHtml: typeof options?.correctedHtml === "string" ? options.correctedHtml : "",
      addressedRiskIds: Array.isArray(options?.addressedRiskIds) ? options.addressedRiskIds : null,
      autoApproveWhenAllAddressed: Boolean(options?.autoApproveWhenAllAddressed)
    });

    return result?.reviewed || null;
  }

  async function handleReprocessDocument(documentId, options = {}) {
    const targetSubjectId = options?.subjectId || selectedSubjectId;
    if (!selectedWorkspaceId || !targetSubjectId || !documentId) return null;
    const result = await runWorkspaceAction("reprocessDocument", {
      workspaceId: selectedWorkspaceId,
      subjectId: targetSubjectId,
      documentId,
      minConfidence: options?.minConfidence
    });
    return result?.reprocessed || null;
  }

  const templatesLoadedRef = useRef(false);
  useEffect(() => {
    if (!["resources", "workspaces"].includes(page) || templatesLoadedRef.current) return;
    templatesLoadedRef.current = true;
    handleListDocumentBlockTemplates().then(setBlockTemplates).catch(() => setBlockTemplates([]));
  });

  async function handleListDocumentBlockTemplates() {
    const result = await postWorkspaceAction("listDocumentBlockTemplates", {});
    if (!result.ok) {
      throw new Error(result.data?.error || "Failed to load block templates");
    }
    return Array.isArray(result.data?.templates) ? result.data.templates : [];
  }

  async function handleSaveDocumentBlockTemplate(template = {}) {
    const result = await postWorkspaceAction("saveDocumentBlockTemplate", { template });
    if (!result.ok) {
      throw new Error(result.data?.error || "Failed to save block template");
    }
    return {
      template: result.data?.template || null,
      templates: Array.isArray(result.data?.templates) ? result.data.templates : []
    };
  }

  async function handleDeleteDocumentBlockTemplate(templateId) {
    const result = await postWorkspaceAction("deleteDocumentBlockTemplate", { templateId });
    if (!result.ok) {
      throw new Error(result.data?.error || "Failed to delete block template");
    }
    return Array.isArray(result.data?.templates) ? result.data.templates : [];
  }

  async function handleSaveGeneratedQuizDocument(payload, subjectId) {
    if (!selectedWorkspaceId || !(subjectId || selectedSubjectId)) return null;
    let folderIds = Array.isArray(payload?.folderIds) ? payload.folderIds : [];
    // Generated material that is not filed anywhere and does not belong to a study plan goes to
    // "Generated material / Resources not in study plans" by itself, instead of floating at the top of the topic.
    if (payload?.autoFile && !folderIds.length) {
      try {
        const subject = (workspaces.find((entry) => entry.id === selectedWorkspaceId)?.subjects || []).find((entry) => entry.id === (subjectId || selectedSubjectId));
        const structure = await ensureSubjectStructure({ folders: (subject?.folders || []).map((folder) => ({ ...folder })), subjectId: subjectId || selectedSubjectId, onCreateFolder: handleCreateFolder });
        if (structure.looseId) folderIds = [structure.looseId];
      } catch { /* filing is a convenience: the document is still saved at the top of the topic */ }
    }
    const result = await runWorkspaceAction("saveGeneratedQuizDocument", {
      workspaceId: selectedWorkspaceId,
      subjectId: subjectId || selectedSubjectId,
      folderIds,
      tags: Array.isArray(payload?.tags) ? payload.tags : [],
      file: payload?.file || {},
      downloads: payload?.downloads || {}
    });

    return result?.savedDocument || null;
  }

  async function handleUpdateGeneratedDocument(documentId, payload, subjectId) {
    if (!selectedWorkspaceId || !(subjectId || selectedSubjectId) || !documentId) return null;
    const result = await runWorkspaceAction("updateGeneratedDocument", {
      workspaceId: selectedWorkspaceId,
      subjectId: subjectId || selectedSubjectId,
      documentId,
      file: payload?.file || {}
    });

    return result?.savedDocument || null;
  }

  // Phone: the workspace rail is a sheet that slides in, so the page keeps the whole screen.
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * The interface critic runs while the app is being built, and in production only when asked for
   * with ?uicheck=1 — a reviewer can turn it on anywhere without it ever showing to a learner.
   */
  const [criticOn, setCriticOn] = useState(false);
  useEffect(() => {
    const asked = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("uicheck");
    setCriticOn(process.env.NODE_ENV !== "production" || asked);
  }, []);

  // "Ask Luna" next to any reader finds the workspace tree here.
  // A reader that shows its own Ask Luna button "claims" the corner, and the page-level "Ask Luna" menu then offers only feedback.
  const [readerClaims, setReaderClaims] = useState(0);
  const claimAskLuna = useCallback(() => { setReaderClaims((count) => count + 1); return () => setReaderClaims((count) => count - 1); }, []);
  const askLunaValue = useMemo(() => ({ workspaces, selectedWorkspaceId, selectedSubjectId, claim: claimAskLuna }), [workspaces, selectedWorkspaceId, selectedSubjectId, claimAskLuna]);

  function handleRoleChange(nextRole) {
    if (account) return; // a real account has one fixed role
    setRole(nextRole);
    setPage(defaultPage[nextRole]);
  }

  return (
    <VisibilityProvider account={account} workspaces={workspaces} refreshKey={`${page}|${shareNotice}`} onOpenPage={openPageStable}>
    <div className={`app-shell${menuOpen ? " nav-open" : ""}`}>
      {/* Phone only: tapping the dimmed page closes the workspace sheet. */}
      <button className="nav-scrim" type="button" aria-label={t("shell.closeMenu")} onClick={() => setMenuOpen(false)} />
      <SideNav
        navItems={navItems}
        page={page}
        onPageChange={(next) => { setPage(next); setMenuOpen(false); }}
        onClose={() => setMenuOpen(false)}
      />
      <main className="main-pane">
        <TopBar title={title} shortTitle={shortTitle} page={page} role={role} onRoleChange={handleRoleChange} onOpenMenu={() => setMenuOpen(true)} account={account} onAccountChange={setAccountOverride} onOpenPage={setPage} askLunaClaimed={readerClaims > 0} compact={mobileStudent && isMobileRoot(page)} hideMenuButton={mobileStudent} moreLinks={phoneMoreLinks} />
        <div className="page-content">
          {account ? <PlatformNotice account={account} onOpenPage={setPage} /> : null}
          {shareNotice ? (
            <div role="status" className="tw-scope mb-3 flex items-center justify-between gap-2 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink">
              <span>{shareNotice}</span>
              <button type="button" className="rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold" onClick={() => setShareNotice("")}>OK</button>
            </div>
          ) : null}
          <AskLunaProvider value={askLunaValue}>
            {mobileStudent ? null : <SectionTabs tabs={sectionTabs} active={tabKeyOf(page)} onChange={(next) => setPage(next)} />}
            {content}
            <GlobalAskLuna title={title} hidden={readerClaims > 0} />
          </AskLunaProvider>
        </div>
      </main>
      <BottomTabs navItems={mobileStudent ? mobileTabs(t) : navItems} page={page} onPageChange={setPage} />
      {openerOverlay}
      {account && shareTarget ? (
        <ShareDialog account={account} item={shareTarget} onClose={() => { setShareTarget(null); announceShareFinished(); }} onDone={(message) => setShareNotice(message)} />
      ) : null}
      {account && practiceTarget ? (
        <SendPracticeDialog
          target={practiceTarget}
          workspaces={workspaces}
          onClose={() => setPracticeTarget(null)}
          onMake={() => { setPracticeTarget(null); setPage("create"); }}
          onPick={(document) => { const target = practiceTarget; setPracticeTarget(null); setShareTarget({ kind: "document", id: document.id, name: document.name, document, initial: { mode: "assign", groupIds: target.groupIds || [], recipientIds: target.recipientIds || [] } }); }}
        />
      ) : null}
      {account && questionsTarget ? (
        <SendQuestionsDialog
          action={questionsTarget.action}
          student={questionsTarget.student}
          workspaces={workspaces}
          workspaceId={selectedWorkspaceId}
          subjectId={selectedSubjectId}
          onSave={(payload) => handleSaveGeneratedQuizDocument(payload)}
          onClose={() => setQuestionsTarget(null)}
          onAssign={(document) => { const target = questionsTarget; setQuestionsTarget(null); setShareTarget({ kind: "document", id: document.id, name: document.name, document, initial: { mode: "assign", groupIds: [], recipientIds: [target.student.id] } }); }}
        />
      ) : null}
      <FirstRunTour role={role} accountId={account?.id || ""} serverSeen={tourSeen} phone={mobileStudent} />
      <UiCritic enabled={criticOn} />
      {/* Beta feedback tool — temporary, see modules/feedback/README.md. */}
      <FeedbackWidget page={page} title={title} role={role} account={account} launcher={false} />
      <AskLunaMenu variant="floating" claimed={readerClaims > 0} />
    </div>
    </VisibilityProvider>
  );
}
