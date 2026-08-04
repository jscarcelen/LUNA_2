"use client";

import { useEffect, useMemo, useState } from "react";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { pageTitles } from "./data";
import { WorkspacePage } from "../modules/workspace";
import { DashboardPage } from "../modules/dashboard";
import { AgentMarketplacePage } from "../modules/agent-marketplace";
import { AIToolsHubPage, AIToolRuntimePage, findAiToolById } from "../modules/ai-tools";
import { BuilderView, RevenueView } from "./views";

const defaultPage = { student: "workspaces", teacher: "workspaces" };
const WORKSPACES_API = "/api/workspaces-supabase";

export function AppShell() {
  const [role, setRole] = useState("student");
  const [page, setPage] = useState(defaultPage.student);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [statusMessage, setStatusMessage] = useState("Loading workspaces...");
  const [isWorking, setIsWorking] = useState(false);

  const currentAiToolId = page.startsWith("ai-tool:") ? page.replace("ai-tool:", "") : "";
  const currentAiTool = currentAiToolId ? findAiToolById(currentAiToolId) : null;
  const title = currentAiTool ? currentAiTool.name : (pageTitles[page] || "LUNA");

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
        setWorkspaces(data.workspaces || []);
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
    if (page === "dashboard") return <DashboardPage />;
    if (page === "workspaces") {
      return (
        <WorkspacePage
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
        />
      );
    }
    if (page === "ai-tools") {
      return <AIToolsHubPage onOpenTool={(toolId) => setPage(`ai-tool:${toolId}`)} />;
    }
    if (currentAiTool) {
      const ToolComponent = currentAiTool.component;
      return (
        <AIToolRuntimePage title={currentAiTool.name} description={currentAiTool.description} onBack={() => setPage("ai-tools")}>
          <ToolComponent
            toolContext={{
              workspaces,
              selectedWorkspaceId,
              selectedSubjectId
            }}
          />
        </AIToolRuntimePage>
      );
    }
    if (page === "marketplace") return <AgentMarketplacePage onGoBuilder={() => setPage("builder")} />;
    if (page === "builder") return <BuilderView />;
    if (page === "revenue") return <RevenueView />;
    return <DashboardPage />;
  }, [page, currentAiTool, workspaces, selectedWorkspaceId, selectedSubjectId, statusMessage, isWorking]);

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
    await runWorkspaceAction("createFolder", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      name,
      parentFolderId: parentFolderId || ""
    });
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
      const contentText = await file.text();
      const sizeKb = file.size / 1024;
      return {
        name: file.name,
        sizeLabel: `${sizeKb.toFixed(1)} KB`,
        content: contentText
      };
    });

    const documents = await Promise.all(readFiles);
    await runWorkspaceAction("uploadDocuments", {
      workspaceId: selectedWorkspaceId,
      subjectId: selectedSubjectId,
      folderIds: Array.isArray(options?.folderIds) ? options.folderIds : [],
      tags: options?.tags || [],
      files: documents
    });
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

  function handleRoleChange(nextRole) {
    setRole(nextRole);
    setPage(defaultPage[nextRole]);
  }

  return (
    <div className="app-shell">
      <SideNav role={role} page={page} onPageChange={setPage} onRoleChange={handleRoleChange} />
      <main className="main-pane">
        <TopBar title={title} />
        <div className="page-content">{content}</div>
      </main>
    </div>
  );
}
