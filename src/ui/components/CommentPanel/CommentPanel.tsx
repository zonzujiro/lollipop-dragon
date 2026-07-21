import "./CommentPanel.css";
import { useEffect, useMemo } from "react";
import { buildCommentThreadGroups } from "../../../markup";
import { useActiveTab } from "../../../store/selectors";
import { useCommentPanelStore } from "../../../store/uiHooks";
import type { CommentType } from "../../../types/criticmarkup";
import { tabRequiresRestoreAccess } from "../../../types/tab";
import { isUserCommentType, USER_COMMENT_TYPES } from "../../commentTypes";
import { CrossFileList, SingleFileList } from "./CommentPanelEntries";
import { CommentPanelAgentRuns } from "./CommentPanelAgentRuns";
import {
  EMPTY_ALL_FILE_COMMENTS,
  EMPTY_ANSWERED_COMMENT_IDS,
  EMPTY_ANSWERED_COMMENT_IDS_BY_PATH,
  EMPTY_COMMENTS,
  EMPTY_FILE_TREE,
  EMPTY_THREAD_GROUPS,
  EMPTY_THREAD_GROUPS_BY_PATH,
  filterCrossFileByType,
  getActiveRootCommentId,
  getAnsweredQuestionIds,
  getRootOnlyComments,
  getThreadGroupsByPath,
  peerCommentToDisplay,
  scrollToBlock,
  type DisplayComment,
} from "./commentPanelModel";

interface Props {
  peerMode?: boolean;
}

export function CommentPanel({ peerMode = false }: Props) {
  const tab = useActiveTab();
  const readOnly = !peerMode && tabRequiresRestoreAccess(tab);
  const comments = tab?.comments ?? EMPTY_COMMENTS;
  const hostThreadGroups = useMemo(
    () => buildCommentThreadGroups(comments),
    [comments],
  );
  const hostRootComments = useMemo(
    () => getRootOnlyComments(comments),
    [comments],
  );
  const resolvedComments = tab?.resolvedComments ?? EMPTY_COMMENTS;
  const answeredQuestionIds = useMemo(
    () => getAnsweredQuestionIds(comments),
    [comments],
  );
  const {
    peerActiveCommentId,
    setActiveCommentId,
    setCommentFilter,
    showToast,
    openAgentSettings,
    agentSettingsOpen,
    myPeerComments,
    peerActiveFilePath,
    navigateToComment,
    editComment,
    deleteComment,
    replyToCommentThread,
    editPeerComment,
    deletePeerComment,
    selectPeerFile,
    stopActiveAgentRun,
    syncActiveAgentRunStatus,
    clearAgentRun,
    activeAgentRun,
    agentRuns,
    activeAgentRunIdByTabId,
    sharedContent,
  } = useCommentPanelStore(tab?.id ?? null);
  const activeCommentId = peerMode
    ? peerActiveCommentId
    : (tab?.activeCommentId ?? null);
  const activeRootCommentId = useMemo(
    () => getActiveRootCommentId(comments, activeCommentId),
    [activeCommentId, comments],
  );
  // The selected question thread, expanded inline in the panel (host mode).
  const activeHostThread = useMemo(() => {
    if (peerMode || !activeRootCommentId) {
      return null;
    }
    const group = hostThreadGroups.find(
      (thread) => thread.root.id === activeRootCommentId,
    );
    return group && group.root.thread ? group : null;
  }, [activeRootCommentId, hostThreadGroups, peerMode]);

  function handleReplyToThread(
    rootCommentId: string,
    text: string,
    type: CommentType,
  ) {
    if (readOnly) {
      showToast("Read-only — restore folder access first");
      return;
    }
    replyToCommentThread(rootCommentId, text, type).catch((error) => {
      console.error("[CommentPanel] failed to post reply:", error);
      showToast("Couldn't post reply");
    });
  }
  const commentFilter = tab?.commentFilter ?? "all";
  const effectiveCommentFilter =
    isUserCommentType(commentFilter) || commentFilter === "resolved"
      ? commentFilter
      : "all";
  const resolvedView = !peerMode && effectiveCommentFilter === "resolved";
  const activeFilePath = peerMode
    ? peerActiveFilePath
    : (tab?.activeFilePath ?? null);
  const fileTree = tab?.fileTree ?? EMPTY_FILE_TREE;
  const allFileComments = tab?.allFileComments ?? EMPTY_ALL_FILE_COMMENTS;

  const isFolderMode = fileTree.length > 0 && !peerMode;
  const isPeerMultiFile =
    peerMode && !!sharedContent && Object.keys(sharedContent.tree).length > 1;

  // Shared mapping: group peer comments by path as DisplayComment[], computed once
  const peerDisplayByPath: Record<string, DisplayComment[]> = useMemo(() => {
    if (!peerMode) {
      return {};
    }
    const byPath: Record<string, DisplayComment[]> = {};
    for (const comment of myPeerComments) {
      if (!byPath[comment.path]) {
        byPath[comment.path] = [];
      }
      byPath[comment.path].push(peerCommentToDisplay(comment));
    }
    return byPath;
  }, [peerMode, myPeerComments]);

  // In peer mode, flat display list filtered to active file (or all)
  const peerDisplayComments: DisplayComment[] = useMemo(() => {
    if (!peerMode) {
      return [];
    }
    if (isPeerMultiFile) {
      return Object.values(peerDisplayByPath).flat();
    }
    return activeFilePath ? (peerDisplayByPath[activeFilePath] ?? []) : [];
  }, [peerMode, isPeerMultiFile, peerDisplayByPath, activeFilePath]);

  const sourceComments = peerMode
    ? peerDisplayComments
    : resolvedView
      ? resolvedComments
      : hostRootComments;

  // Build peer cross-file entries from the shared grouped map
  const peerCrossFileEntries = useMemo(() => {
    if (!isPeerMultiFile) {
      return [];
    }
    return Object.entries(peerDisplayByPath)
      .sort(([pathA], [pathB]) => pathA.localeCompare(pathB))
      .map(([path, pathComments]) => ({
        filePath: path,
        fileName: path.split("/").pop() ?? path,
        comments: pathComments,
      }));
  }, [isPeerMultiFile, peerDisplayByPath]);

  // Build cross-file flat list for folder mode (only files with comments)
  const crossFileComments = useMemo(() => {
    if (!isFolderMode) {
      return [];
    }
    const entries = Object.values(allFileComments)
      .map((entry) => ({
        ...entry,
        comments: getRootOnlyComments(entry.comments),
      }))
      .filter((entry) => entry.comments.length > 0);
    entries.sort((entryA, entryB) =>
      entryA.filePath.localeCompare(entryB.filePath),
    );
    return entries;
  }, [isFolderMode, allFileComments]);
  const answeredQuestionIdsByPath = useMemo(() => {
    if (!isFolderMode) {
      return EMPTY_ANSWERED_COMMENT_IDS_BY_PATH;
    }
    const byPath = new Map<string, ReadonlySet<string>>();
    for (const entry of Object.values(allFileComments)) {
      byPath.set(entry.filePath, getAnsweredQuestionIds(entry.comments));
    }
    return byPath;
  }, [allFileComments, isFolderMode]);
  const threadGroupsByPath = useMemo(() => {
    if (!isFolderMode) {
      return EMPTY_THREAD_GROUPS_BY_PATH;
    }
    return getThreadGroupsByPath(allFileComments);
  }, [allFileComments, isFolderMode]);

  // Total count across all files for folder/peer-multi-file mode
  const totalCrossFileCount = useMemo(() => {
    if (isPeerMultiFile) {
      return myPeerComments.length;
    }
    if (!isFolderMode) {
      return 0;
    }
    return crossFileComments.reduce(
      (sum, entry) => sum + entry.comments.length,
      0,
    );
  }, [isPeerMultiFile, myPeerComments.length, isFolderMode, crossFileComments]);

  // All comments flat for counting types in folder/peer-multi-file mode
  const allCommentsFlat = useMemo(() => {
    if (isPeerMultiFile) {
      return peerDisplayComments;
    }
    if (!isFolderMode) {
      return sourceComments;
    }
    return crossFileComments.flatMap((entry) => entry.comments);
  }, [
    isPeerMultiFile,
    peerDisplayComments,
    isFolderMode,
    crossFileComments,
    sourceComments,
  ]);

  // Count per type
  const counts = useMemo(() => {
    const typeCounts: Partial<Record<CommentType, number>> = {};
    for (const comment of allCommentsFlat) {
      typeCounts[comment.type] = (typeCounts[comment.type] ?? 0) + 1;
    }
    return typeCounts;
  }, [allCommentsFlat]);

  const activeTypes = USER_COMMENT_TYPES.filter(
    (type) => (counts[type] ?? 0) > 0,
  );

  // For single-file mode: visible list
  const visible =
    effectiveCommentFilter === "all" ||
    effectiveCommentFilter === "pending" ||
    effectiveCommentFilter === "resolved"
      ? sourceComments
      : sourceComments.filter(
          (comment) => comment.type === effectiveCommentFilter,
        );

  // For folder mode: filter cross-file entries
  const filteredCrossFile = useMemo(() => {
    if (!isFolderMode) {
      return crossFileComments;
    }
    return filterCrossFileByType(crossFileComments, effectiveCommentFilter);
  }, [isFolderMode, crossFileComments, effectiveCommentFilter]);

  // For peer multi-file mode: filter peer cross-file entries
  const filteredPeerCrossFile = useMemo(() => {
    if (!isPeerMultiFile) {
      return peerCrossFileEntries;
    }
    return filterCrossFileByType(peerCrossFileEntries, effectiveCommentFilter);
  }, [isPeerMultiFile, peerCrossFileEntries, effectiveCommentFilter]);

  function handleEntryClick(id: string, blockIndex: number | undefined) {
    setActiveCommentId(id);
    scrollToBlock(blockIndex);
  }

  function handleCrossFileClick(filePath: string, rawStart: number) {
    navigateToComment(filePath, rawStart);
  }

  function handleEditHostComment(id: string, type: CommentType, text: string) {
    if (readOnly) {
      showToast("Read-only — restore folder access first");
      return;
    }
    editComment(id, type, text).catch((error) => {
      console.error("[CommentPanel] failed to edit comment:", error);
      showToast("Couldn't edit comment");
    });
  }

  function handleDeleteHostComment(id: string) {
    if (readOnly) {
      showToast("Read-only — restore folder access first");
      return;
    }
    deleteComment(id).catch((error) => {
      console.error("[CommentPanel] failed to delete comment:", error);
      showToast("Couldn't delete comment");
    });
  }

  useEffect(() => {
    const activePanelCommentId = peerMode
      ? activeCommentId
      : activeRootCommentId;
    if (!activePanelCommentId) {
      return;
    }
    const el = document.querySelector(
      `.comment-panel [data-comment-id="${activePanelCommentId}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeCommentId, activeRootCommentId, peerMode]);

  const openCount = peerMode
    ? sourceComments.length
    : isFolderMode
      ? totalCrossFileCount
      : hostRootComments.length;
  const displayCount = resolvedView
    ? resolvedComments.length
    : isPeerMultiFile || isFolderMode
      ? totalCrossFileCount
      : sourceComments.length;
  const showTypeFilters = !peerMode && activeTypes.length > 0;

  return (
    <aside className="comment-panel" aria-label="Comments">
      <div className="comment-panel__header">
        <span className="comment-panel__title">
          Comments
          <span className="comment-panel__open-count">{openCount} open</span>
          {!peerMode && resolvedComments.length > 0 && (
            <span className="comment-panel__resolved-count">
              · {resolvedComments.length} resolved
            </span>
          )}
        </span>
      </div>

      {readOnly && (
        <div className="comment-panel__read-only" role="status">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          read-only until folder access is restored
        </div>
      )}

      {(showTypeFilters || (!peerMode && resolvedComments.length > 0)) && (
        <div className="comment-panel__filters">
          <button
            className={`comment-panel__filter${effectiveCommentFilter === "all" || effectiveCommentFilter === "pending" ? " comment-panel__filter--active" : ""}`}
            onClick={() => setCommentFilter("all")}
          >
            All{" "}
            <span className="comment-panel__filter-count">{displayCount}</span>
          </button>
          {activeTypes.map((type) => (
            <button
              key={type}
              className={`comment-panel__filter${effectiveCommentFilter === type ? " comment-panel__filter--active" : ""}`}
              data-comment-type={type}
              onClick={() =>
                setCommentFilter(effectiveCommentFilter === type ? "all" : type)
              }
            >
              <span className="comment-panel__filter-swatch" />
              {type}{" "}
              <span className="comment-panel__filter-count">
                {counts[type]}
              </span>
            </button>
          ))}
          {!peerMode && resolvedComments.length > 0 && (
            <button
              className={`comment-panel__filter${resolvedView ? " comment-panel__filter--active" : ""}`}
              onClick={() =>
                setCommentFilter(resolvedView ? "all" : "resolved")
              }
            >
              Resolved{" "}
              <span className="comment-panel__filter-count">
                {resolvedComments.length}
              </span>
            </button>
          )}
        </div>
      )}

      <CommentPanelAgentRuns
        activeAgentRun={activeAgentRun}
        activeAgentRunIdByTabId={activeAgentRunIdByTabId}
        agentRuns={agentRuns}
        agentSettingsOpen={agentSettingsOpen}
        clearAgentRun={clearAgentRun}
        onOpenAgentSettings={openAgentSettings}
        peerMode={peerMode}
        showToast={showToast}
        stopActiveAgentRun={stopActiveAgentRun}
        syncActiveAgentRunStatus={syncActiveAgentRunStatus}
        tabId={tab?.id ?? null}
      />

      <div className="comment-panel__list">
        {resolvedView ? (
          <SingleFileList
            visible={visible}
            peerMode={false}
            activeCommentId={activeRootCommentId}
            sourceComments={sourceComments}
            onEntryClick={handleEntryClick}
            onEdit={handleEditHostComment}
            onDelete={handleDeleteHostComment}
            answeredCommentIds={EMPTY_ANSWERED_COMMENT_IDS}
            threadGroups={EMPTY_THREAD_GROUPS}
            resolvedView
          />
        ) : isPeerMultiFile ? (
          <CrossFileList
            entries={filteredPeerCrossFile}
            activeFilePath={activeFilePath}
            activeCommentId={activeCommentId}
            onEntryClick={handleEntryClick}
            onCrossFileClick={(filePath) => selectPeerFile(filePath)}
            onEdit={editPeerComment}
            onDelete={deletePeerComment}
            answeredCommentIdsByPath={EMPTY_ANSWERED_COMMENT_IDS_BY_PATH}
            threadGroupsByPath={EMPTY_THREAD_GROUPS_BY_PATH}
          />
        ) : isFolderMode ? (
          <CrossFileList
            entries={filteredCrossFile}
            activeFilePath={activeFilePath}
            activeCommentId={activeRootCommentId}
            onEntryClick={handleEntryClick}
            onCrossFileClick={handleCrossFileClick}
            onEdit={handleEditHostComment}
            onDelete={handleDeleteHostComment}
            answeredCommentIdsByPath={answeredQuestionIdsByPath}
            threadGroupsByPath={threadGroupsByPath}
            activeThreadGroup={activeHostThread}
            onReply={handleReplyToThread}
            onCloseThread={() => setActiveCommentId(null)}
          />
        ) : (
          <SingleFileList
            visible={visible}
            peerMode={peerMode}
            activeCommentId={peerMode ? activeCommentId : activeRootCommentId}
            sourceComments={sourceComments}
            onEntryClick={handleEntryClick}
            onEdit={peerMode ? editPeerComment : handleEditHostComment}
            onDelete={peerMode ? deletePeerComment : handleDeleteHostComment}
            answeredCommentIds={
              peerMode ? EMPTY_ANSWERED_COMMENT_IDS : answeredQuestionIds
            }
            threadGroups={peerMode ? EMPTY_THREAD_GROUPS : hostThreadGroups}
            activeThreadGroup={activeHostThread}
            onReply={handleReplyToThread}
            onCloseThread={() => setActiveCommentId(null)}
          />
        )}
      </div>
      {!peerMode && !resolvedView && resolvedComments.length > 0 && (
        <button
          className="comment-panel__resolved-strip"
          onClick={() => setCommentFilter("resolved")}
        >
          {resolvedComments.length} resolved — kept for history
        </button>
      )}
      <footer className="comment-panel__shortcut-hints">
        <span>
          <kbd>J</kbd>
          <kbd>K</kbd> next / prev
        </span>
        <span>
          <kbd>C</kbd> comment
        </span>
        <span>
          <kbd>⌘K</kbd> commands
        </span>
      </footer>
    </aside>
  );
}
