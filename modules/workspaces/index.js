export {
  WORKSPACES_DOMAIN_VERSION,
  DEFAULT_WORKSPACE_COLOR,
  DEFAULT_SUBJECT_COLOR,
  normalizeWorkspaceName,
  normalizeSubjectName,
  normalizeWorkspaceColor,
  normalizeSubjectColor
} from "./contracts";

export {
  buildFolderChildrenMap,
  flattenFolders,
  buildFolderPathMap,
  filterDocuments,
  splitDocumentsByFolder
} from "./treeFilters";