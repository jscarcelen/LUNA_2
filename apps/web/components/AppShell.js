"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { navByRole, pageTitles, roleProfiles } from "./data";
import { WorkspacePage } from "../modules/workspace";
import { DashboardPage } from "../modules/dashboard";
import { AgentMarketplacePage } from "../modules/agent-marketplace";
import { ActivitiesPage } from "../modules/activities/ActivitiesPage";
import { ResourcesPage } from "../modules/resources/ResourcesPage";
import { PerformancePage } from "../modules/performance/PerformancePage";
import { AIToolsHubPage, AIToolRuntimePage, RunAgentPage, findAiToolById } from "../modules/ai-tools";
import { BuilderView, RevenueView } from "./views";

const defaultPage = { student: "dashboard", teacher: "dashboard", parent: "dashboard" };
const WORKSPACES_API = "/api/workspaces-supabase";

export function AppShell() {
  const [role, setRole] = useState("student");
  const [page, setPage] = useState(defaultPage.student);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Loading workspaces...");
  const [isWorking, setIsWorking] = useState(false);
  const [blockTemplates, setBlockTemplates] = useState([]);

  const currentAiToolId = page.startsWith("ai-tool:") ? page.replace("ai-tool:", "").split("?")[0] : "";
  const currentAiTool = currentAiToolId ? findAiToolById(currentAiToolId) : null;
  const currentCustomAgentId = page.startsWith("custom-agent:") ? page.replace("custom-agent:", "").split("?")[0] : "";
  const resumeResourceDocumentId = page.includes("?resource=") ? page.split("?resource=")[1] : "";
  const editAgentDocumentId = page.startsWith("agent-edit:") ? page.replace("agent-edit:", "") : "";
  const openTemplateId = page.startsWith("ai-tool:template-builder?open=") ? page.split("?open=")[1] : "";
  const roleHomeTitle = { student: "Home", teacher: "Classes", parent: "Children" }[role] || "Home";
  const title = currentAiTool ? currentAiTool.name : (page === "dashboard" ? roleHomeTitle : (pageTitles[page] || "LUNA"));
  const navItems = navByRole[role] || [];

  useEffect(() => {
    loadWorkspaces();
  }, []);

  function selectFallback(workspaceList) {
    const firstWorkspace = workspaceList[0];
    setSelectedWorkspaceId(firstWorkspace?.id || "");
    setSelectedSubjectId(firstWorkspace?.subjects?.[0]?.id || "");
  }

  async function loadWorkspaces() {
    try {
      setIsWorking(true);
      const response = await fetch(WORKSPACES_API, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load workspace data");
      }
      setWorkspaces(data.workspaces || []);
      if (!selectedWorkspaceId && data.workspaces?.length) {
        const firstWorkspace = data.workspaces[0];
        setSelectedWorkspaceId(firstWorkspace.id);
        setSelectedSubjectId(firstWorkspace.subjects?.[0]?.id || "");
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
      const data = await response.json();
      if (response.ok) {
        if (Array.isArray(data.workspaces)) {
          setWorkspaces(data.workspaces);
        }
        setStatusMessage("");
        return { ok: true, status: response.status, data };
      }
      setStatusMessage(`Action failed (${action}): ${String(data.error || "Unknown error")}`);
      return { ok: false, status: response.status, data };
    } catch (error) {
      setStatusMessage(`Action failed (${action}): ${String(error.message || error)}`);
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

  const content = useMemo(() => {
    if (page === "dashboard") return <DashboardPage role={role} onNavigate={setPage} />;
    if (page === "performance") {
      return (
        <PerformancePage
          role={role}
          profileName={roleProfiles[role]?.name || ""}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
          onSaveGeneratedQuizDocument={handleSaveGeneratedQuizDocument}
          onRemoveDocument={handleRemoveDocument}
          onOpenPage={(target) => setPage(target)}
        />
      );
    }
    if (page === "resources") {
      return (
        <ResourcesPage
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
          templates={blockTemplates}
          role={role}
          profileName={roleProfiles[role]?.name || ""}
          onSaveGeneratedQuizDocument={handleSaveGeneratedQuizDocument}
          onUpdateGeneratedDocument={handleUpdateGeneratedDocument}
          onUpdateDocumentMeta={handleUpdateDocumentMeta}
          onRemoveDocument={handleRemoveDocument}
          onCreateFolder={handleCreateFolder}
          onOpenResource={(documentId) => {
            const resourceDocument = (workspaces.flatMap((w) => w.subjects || []).flatMap((s) => s.documents || [])).find((d) => d.id === documentId);
            let agentId = "";
            try { agentId = JSON.parse(String(resourceDocument?.content || "{}"))?.meta?.agentId || ""; } catch { agentId = ""; }
            setPage(agentId ? `custom-agent:${agentId}?resource=${documentId}` : "ai-tools");
          }}
        />
      );
    }
    if (page === "activities") {
      return (
        <ActivitiesPage
          role={role}
          profileName={roleProfiles[role]?.name || ""}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
          onSaveGeneratedQuizDocument={handleSaveGeneratedQuizDocument}
          onUpdateDocumentMeta={handleUpdateDocumentMeta}
          onRemoveDocument={handleRemoveDocument}
          onOpenTool={(target) => setPage(target)}
        />
      );
    }
    if (page === "workspaces") {
      return (
        <WorkspacePage
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
        />
      );
    }
    if (page === "ai-tools") {
      return (
        <AIToolsHubPage
          onOpenTool={(toolId) => setPage(`ai-tool:${toolId}`)}
          onOpenCustomAgent={(documentId) => setPage(`custom-agent:${documentId}`)}
          onEditAgent={(documentId) => setPage(`agent-edit:${documentId}`)}
          onListTemplates={handleListDocumentBlockTemplates}
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
        <AIToolRuntimePage title={activeTool.name} description={activeTool.description} onBack={() => setPage("ai-tools")}>
          <ToolComponent
            toolContext={{
              editAgentDocumentId,
              openTemplateId,
              workspaces,
              selectedWorkspaceId,
              selectedSubjectId,
              onUploadTxt: handleUploadTxt,
              onOpenTool: (toolId) => setPage(`ai-tool:${toolId}`),
              onReviewDocumentExtraction: handleReviewDocumentExtraction,
              onSaveGeneratedQuizDocument: handleSaveGeneratedQuizDocument,
              onUpdateGeneratedDocument: handleUpdateGeneratedDocument,
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
        <AIToolRuntimePage title="Run Agent" description="Generate output with your saved agent." onBack={() => setPage("ai-tools")}>
          <RunAgentPage
            agentDocumentId={currentCustomAgentId}
            toolContext={{
              workspaces,
              selectedWorkspaceId,
              selectedSubjectId,
              onSaveGeneratedQuizDocument: handleSaveGeneratedQuizDocument,
              onUpdateGeneratedDocument: handleUpdateGeneratedDocument,
              onListDocumentBlockTemplates: handleListDocumentBlockTemplates,
              resumeResourceDocumentId,
              onOpenPage: (target) => setPage(target),
              onOpenTool: (toolId) => setPage(`ai-tool:${toolId}`)
            }}
          />
        </AIToolRuntimePage>
      );
    }
    if (page === "marketplace") {
      return (
        <AgentMarketplacePage
          onGoBuilder={() => setPage("ai-tool:agent-builder")}
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedSubjectId={selectedSubjectId}
          onSaveGeneratedQuizDocument={handleSaveGeneratedQuizDocument}
          onOpenAgent={(documentId) => setPage(`custom-agent:${documentId}`)}
        />
      );
    }
    if (page === "builder") return <BuilderView />;
    if (page === "revenue") return <RevenueView />;
    return <DashboardPage role={role} onNavigate={setPage} />;
  }, [page, role, currentAiTool, currentCustomAgentId, editAgentDocumentId, openTemplateId, workspaces, selectedWorkspaceId, selectedSubjectId, statusMessage, isWorking]);

  function handleSelectWorkspace(workspaceId) {
    setSelectedWorkspaceId(workspaceId);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    setSelectedSubjectId(workspace && workspace.subjects[0] ? workspace.subjects[0].id : "");
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
      if (!window.confirm(message)) return;
      const forced = await postWorkspaceAction("removeWorkspace", { workspaceId, force: true });
      if (forced.ok && workspaceId === selectedWorkspaceId) {
        selectFallback(forced.data.workspaces || []);
      }
    }
  }

  async function handleCreateSubject(name) {
    if (!selectedWorkspaceId) return;
    const result = await runWorkspaceAction("createSubject", {
      workspaceId: selectedWorkspaceId,
      name
    });
    if (result?.created?.id) {
      setSelectedSubjectId(result.created.id);
    }
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
        setSelectedSubjectId(workspace?.subjects?.[0]?.id || "");
      }
      return;
    }

    if (result.status === 409 && result.data?.requiresForce) {
      const c = result.data.cascade || {};
      const message = `Subject has ${c.folders || 0} folders, ${c.topicTags || 0} topic tags, and ${c.documents || 0} documents. Force delete?`;
      if (!window.confirm(message)) return;
      const forced = await postWorkspaceAction("removeSubject", {
        workspaceId: selectedWorkspaceId,
        subjectId,
        force: true
      });
      if (forced.ok && subjectId === selectedSubjectId) {
        const workspace = (forced.data.workspaces || []).find((item) => item.id === selectedWorkspaceId);
        setSelectedSubjectId(workspace?.subjects?.[0]?.id || "");
      }
    }
  }

  async function handleCreateFolder(name, parentFolderId) {
    if (!selectedWorkspaceId || !selectedSubjectId) return;
    const result = await runWorkspaceAction("createFolder", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
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

  async function handleRenameFolder(folderId, nextName) {
    if (!selectedWorkspaceId || !selectedSubjectId) return;
    await runWorkspaceAction("renameFolder", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      folderId,
      nextName
    });
  }

  async function handleRemoveFolder(folderId) {
    if (!selectedWorkspaceId || !selectedSubjectId) return;
    await runWorkspaceAction("removeFolder", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
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
      subjectId: selectedSubjectId,
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

  async function handleRenameDocument(documentId, nextName) {
    if (!selectedWorkspaceId || !selectedSubjectId) return;
    await runWorkspaceAction("renameDocument", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      documentId,
      nextName
    });
  }

  async function handleRemoveDocument(documentId) {
    if (!selectedWorkspaceId || !selectedSubjectId) return;
    await runWorkspaceAction("removeDocument", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      documentId
    });
  }

  async function handleUpdateDocumentMeta(documentId, options = {}) {
    if (!selectedWorkspaceId || !selectedSubjectId || !documentId) return;
    await runWorkspaceAction("updateDocumentMeta", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      documentId,
      folderIds: Array.isArray(options.folderIds) ? options.folderIds : [],
      tags: Array.isArray(options.tags) ? options.tags : []
    });
  }

  async function handleUpdateDocumentContent(documentId, options = {}) {
    if (!selectedWorkspaceId || !selectedSubjectId || !documentId) return null;
    const payload = {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
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
    if (page !== "resources" || templatesLoadedRef.current) return;
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

  async function handleSaveGeneratedQuizDocument(payload) {
    if (!selectedWorkspaceId || !selectedSubjectId) return null;
    const result = await runWorkspaceAction("saveGeneratedQuizDocument", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      folderIds: Array.isArray(payload?.folderIds) ? payload.folderIds : [],
      tags: Array.isArray(payload?.tags) ? payload.tags : [],
      file: payload?.file || {},
      downloads: payload?.downloads || {}
    });

    return result?.savedDocument || null;
  }

  async function handleUpdateGeneratedDocument(documentId, payload) {
    if (!selectedWorkspaceId || !selectedSubjectId || !documentId) return null;
    const result = await runWorkspaceAction("updateGeneratedDocument", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      documentId,
      file: payload?.file || {}
    });

    return result?.savedDocument || null;
  }

  function handleRoleChange(nextRole) {
    setRole(nextRole);
    setPage(defaultPage[nextRole]);
  }

  return (
    <div className="app-shell">
      <SideNav
        role={role}
        onRoleChange={handleRoleChange}
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        onRenameWorkspace={handleRenameWorkspace}
        onSetWorkspaceColor={handleSetWorkspaceColor}
        onRemoveWorkspace={handleRemoveWorkspace}
        isWorking={isWorking}
      />
      <main className="main-pane">
        <TopBar title={title} navItems={navItems} page={page} onPageChange={setPage} />
        <div className="page-content">{content}</div>
      </main>
    </div>
  );
}
