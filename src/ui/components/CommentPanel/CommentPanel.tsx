import "./CommentPanel.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildCommentThreadGroups } from "../../../markup";
import {
  getActiveAgentRunForTab,
  getFinishedAgentRunHistoryForTab,
} from "../../../modules/agent-workflow";
import type { AgentRun, AgentRunStatus } from "../../../modules/agent-workflow";
import {
  canRunAgent,
  canShowTerminal,
  getAgentRuntimeCapability,
  resizeTerminal,
  sendTerminalData,
} from "../../../runtime";
import type { AgentRuntimeCapability } from "../../../runtime";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";
import type { Comment, CommentType } from "../../../types/criticmarkup";
import type { PeerComment } from "../../../types/share";
import type { TabState } from "../../../types/tab";
import { canEditComment } from "../../../utils/commentPermissions";
import {
  normalizeUserCommentType,
  USER_COMMENT_TYPES,
} from "../../commentTypes";
import { AgentTerminal } from "../AgentTerminal";

const EDITABLE_CRITIC_TYPES: Comment["criticType"][] = ["comment", "highlight"];
const ACTIVE_AGENT_RUN_STATUSES = new Set<AgentRunStatus>([
  "queued",
  "running",
  "needs_attention",
]);
const AGENT_RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  needs_attention: "Needs attention",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};
const AGENT_RUN_TASK_LABEL = {
  address_comments: "Address comments",
  answer_questions: "Answer questions",
  review_peer_comments: "Review peer comments",
};
const EMPTY_COMMENTS: Comment[] = [];
const EMPTY_FILE_TREE: TabState["fileTree"] = [];
const EMPTY_ALL_FILE_COMMENTS: TabState["allFileComments"] = {};
const EMPTY_AGENT_RUNS: AgentRun[] = [];
const EMPTY_ANSWERED_COMMENT_IDS = new Set<string>();
const EMPTY_ANSWERED_COMMENT_IDS_BY_PATH = new Map<
  string,
  ReadonlySet<string>
>();
const INITIAL_AGENT_CAPABILITY: AgentRuntimeCapability = {
  canRunAgent: false,
  unavailableMessage: canRunAgent
    ? null
    : "Local agent execution is unavailable on web.",
};

function scrollToBlock(blockIndex: number | undefined) {
  if (blockIndex === undefined) {
    return;
  }
  document
    .querySelector(`[data-block-index="${blockIndex}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

interface DisplayComment {
  id: string;
  type: CommentType;
  text: string;
  blockIndex: number | undefined;
  quote: string | undefined;
  authorLabel: string;
  createdAt: string;
}

function peerCommentToDisplay(comment: PeerComment): DisplayComment {
  return {
    id: comment.id,
    type: comment.commentType,
    text: comment.text,
    blockIndex: comment.blockRef.blockIndex,
    quote: comment.blockRef.quote,
    authorLabel: comment.peerName,
    createdAt: comment.createdAt,
  };
}

function formatRelativeTime(createdAt: string): string {
  const elapsedMilliseconds = Date.now() - new Date(createdAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMilliseconds / 60000));
  if (elapsedMinutes < 1) {
    return "now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} h`;
  }
  return `${Math.floor(elapsedHours / 24)} d`;
}

function formatAgentRunTargets(targetPaths: string[]): string {
  if (targetPaths.length === 0) {
    return "No target";
  }
  if (targetPaths.length === 1) {
    return targetPaths[0];
  }
  return `${targetPaths[0]} +${targetPaths.length - 1} more`;
}

function formatAgentRunCommentCount(commentCount: number): string {
  if (commentCount === 0) {
    return "no comments";
  }
  if (commentCount === 1) {
    return "1 comment";
  }
  return `${commentCount} comments`;
}

function formatAgentRunScope(run: AgentRun): string {
  return `${AGENT_RUN_TASK_LABEL[run.taskKind]} · ${formatAgentRunTargets(
    run.targetPaths,
  )} · ${formatAgentRunCommentCount(run.selectedCommentIds.length)}`;
}

interface CrossFileEntry<C extends { type: CommentType }> {
  filePath: string;
  fileName: string;
  comments: C[];
}

function filterCrossFileByType<C extends { type: CommentType }>(
  entries: CrossFileEntry<C>[],
  commentFilter: string,
): CrossFileEntry<C>[] {
  if (commentFilter === "all" || commentFilter === "pending") {
    return entries;
  }
  return entries
    .map((entry) => ({
      ...entry,
      comments: entry.comments.filter(
        (comment) => comment.type === commentFilter,
      ),
    }))
    .filter((entry) => entry.comments.length > 0);
}

function getRootOnlyComments(comments: Comment[]): Comment[] {
  return buildCommentThreadGroups(comments).map((group) => group.root);
}

function getAnsweredQuestionIds(comments: Comment[]): ReadonlySet<string> {
  const answeredQuestionIds = new Set<string>();
  for (const group of buildCommentThreadGroups(comments)) {
    if (
      group.root.type === "question" &&
      group.replies.some((reply) => reply.type === "answer")
    ) {
      answeredQuestionIds.add(group.root.id);
    }
  }
  return answeredQuestionIds;
}

function getActiveRootCommentId(
  comments: Comment[],
  activeCommentId: string | null,
): string | null {
  if (!activeCommentId) {
    return null;
  }

  for (const group of buildCommentThreadGroups(comments)) {
    if (
      group.root.id === activeCommentId ||
      group.replies.some((reply) => reply.id === activeCommentId)
    ) {
      return group.root.id;
    }
  }

  return activeCommentId;
}

interface Props {
  peerMode?: boolean;
}

export function CommentPanel({ peerMode = false }: Props) {
  const tab = useActiveTab();
  const comments = tab?.comments ?? EMPTY_COMMENTS;
  const hostRootComments = useMemo(
    () => getRootOnlyComments(comments),
    [comments],
  );
  const resolvedComments = tab?.resolvedComments ?? EMPTY_COMMENTS;
  const answeredQuestionIds = useMemo(
    () => getAnsweredQuestionIds(comments),
    [comments],
  );
  const peerActiveCommentId = useAppStore((state) => state.peerActiveCommentId);
  const activeCommentId = peerMode
    ? peerActiveCommentId
    : (tab?.activeCommentId ?? null);
  const activeRootCommentId = useMemo(
    () => getActiveRootCommentId(comments, activeCommentId),
    [activeCommentId, comments],
  );
  const commentFilter = tab?.commentFilter ?? "all";
  const effectiveCommentFilter =
    commentFilter === "clarify" ||
    commentFilter === "rewrite" ||
    commentFilter === "resolved"
      ? commentFilter
      : "all";
  const resolvedView = !peerMode && effectiveCommentFilter === "resolved";
  const setActiveCommentId = useAppStore((state) => state.setActiveCommentId);
  const setCommentFilter = useAppStore((state) => state.setCommentFilter);
  const showToast = useAppStore((state) => state.showToast);
  const openAgentSettings = useAppStore((state) => state.openAgentSettings);
  const agentSettingsOpen = useAppStore((state) => state.agentSettingsOpen);
  const myPeerComments = useAppStore((state) => state.myPeerComments);
  const peerActiveFilePath = useAppStore((state) => state.peerActiveFilePath);
  const activeFilePath = peerMode
    ? peerActiveFilePath
    : (tab?.activeFilePath ?? null);
  const fileTree = tab?.fileTree ?? EMPTY_FILE_TREE;
  const allFileComments = tab?.allFileComments ?? EMPTY_ALL_FILE_COMMENTS;
  const navigateToComment = useAppStore((state) => state.navigateToComment);
  const editComment = useAppStore((state) => state.editComment);
  const deleteComment = useAppStore((state) => state.deleteComment);
  const editPeerComment = useAppStore((state) => state.editPeerComment);
  const deletePeerComment = useAppStore((state) => state.deletePeerComment);
  const selectPeerFile = useAppStore((state) => state.selectPeerFile);
  const stopActiveAgentRun = useAppStore((state) => state.stopActiveAgentRun);
  const syncActiveAgentRunStatus = useAppStore(
    (state) => state.syncActiveAgentRunStatus,
  );
  const clearAgentRun = useAppStore((state) => state.clearAgentRun);
  const activeAgentRun = useAppStore((state) =>
    tab?.id ? getActiveAgentRunForTab(state, tab.id) : null,
  );
  const agentRuns = useAppStore((state) => state.agentRuns);
  const activeAgentRunIdByTabId = useAppStore(
    (state) => state.activeAgentRunIdByTabId,
  );
  const sharedContent = useAppStore((state) => state.sharedContent);
  const [agentRunTerminalOpen, setAgentRunTerminalOpen] = useState(false);
  const [agentCapability, setAgentCapability] = useState(
    INITIAL_AGENT_CAPABILITY,
  );
  const previousAgentRunRef = useRef<{
    id: string;
    status: AgentRunStatus;
  } | null>(null);

  const isFolderMode = fileTree.length > 0 && !peerMode;
  const isPeerMultiFile =
    peerMode && !!sharedContent && Object.keys(sharedContent.tree).length > 1;

  useEffect(() => {
    const previousRun = previousAgentRunRef.current;
    if (
      activeAgentRun &&
      previousRun?.id === activeAgentRun.id &&
      ACTIVE_AGENT_RUN_STATUSES.has(previousRun.status) &&
      !ACTIVE_AGENT_RUN_STATUSES.has(activeAgentRun.status)
    ) {
      const messages: Record<
        Exclude<AgentRunStatus, "queued" | "running" | "needs_attention">,
        string
      > = {
        completed: "Agent run complete · review the updated file",
        failed: "Agent run failed · open the run card for details",
        stopped: "Agent run stopped",
      };
      const message = messages[activeAgentRun.status];
      if (message) {
        showToast(message);
      }
    }
    previousAgentRunRef.current = activeAgentRun
      ? { id: activeAgentRun.id, status: activeAgentRun.status }
      : null;
  }, [activeAgentRun, showToast]);

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
    editComment(id, type, text).catch((error) => {
      console.error("[CommentPanel] failed to edit comment:", error);
      showToast("Couldn't edit comment");
    });
  }

  function handleDeleteHostComment(id: string) {
    deleteComment(id).catch((error) => {
      console.error("[CommentPanel] failed to delete comment:", error);
      showToast("Couldn't delete comment");
    });
  }

  const canStopAgentRun = Boolean(
    activeAgentRun && ACTIVE_AGENT_RUN_STATUSES.has(activeAgentRun.status),
  );
  const showAgentRunStatus = !peerMode && activeAgentRun;
  const activeAgentRunId = activeAgentRun?.id ?? null;
  const agentRunHistory = useMemo(
    () =>
      tab?.id
        ? getFinishedAgentRunHistoryForTab(
            { agentRuns, activeAgentRunIdByTabId },
            tab.id,
          )
        : EMPTY_AGENT_RUNS,
    [activeAgentRunIdByTabId, agentRuns, tab?.id],
  );
  const visibleAgentRunHistory = useMemo(
    () => agentRunHistory.filter((run) => run.id !== activeAgentRunId),
    [activeAgentRunId, agentRunHistory],
  );
  const showAgentRunHistory = !peerMode && visibleAgentRunHistory.length > 0;
  const canAttachActiveTerminal = Boolean(
    canShowTerminal && activeAgentRun?.terminalAttachmentId,
  );
  const activeAgentRunScope = activeAgentRun
    ? `${AGENT_RUN_TASK_LABEL[activeAgentRun.taskKind]} · ${formatAgentRunTargets(
        activeAgentRun.targetPaths,
      )} · ${formatAgentRunCommentCount(
        activeAgentRun.selectedCommentIds.length,
      )}`
    : null;
  const showAgentCapabilityWarning = Boolean(
    !peerMode &&
    canRunAgent &&
    !agentCapability.canRunAgent &&
    agentCapability.unavailableMessage,
  );

  async function handleStopAgentRun() {
    const result = await stopActiveAgentRun();
    if (result.status === "unavailable") {
      showToast(result.message);
    }
  }

  async function handleCopyActiveRunPrompt() {
    if (!activeAgentRun?.prompt) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeAgentRun.prompt);
      showToast("Agent run prompt copied");
    } catch (error) {
      console.error("[CommentPanel] failed to copy run prompt:", error);
      showToast("Couldn't copy agent prompt");
    }
  }

  async function handleCopyAgentRunPrompt(run: AgentRun) {
    if (!run.prompt) {
      return;
    }

    try {
      await navigator.clipboard.writeText(run.prompt);
      showToast("Agent run prompt copied");
    } catch (error) {
      console.error("[CommentPanel] failed to copy run prompt:", error);
      showToast("Couldn't copy agent prompt");
    }
  }

  async function handleCopyAgentRunOutput(run: AgentRun) {
    if (!run.output) {
      return;
    }

    try {
      await navigator.clipboard.writeText(run.output);
      showToast("Agent run output copied");
    } catch (error) {
      console.error("[CommentPanel] failed to copy run output:", error);
      showToast("Couldn't copy agent output");
    }
  }

  function toggleAgentRunTerminal() {
    setAgentRunTerminalOpen((current) => !current);
  }

  const handleTerminalData = useCallback(
    async (data: string) => {
      if (!activeAgentRun?.terminalAttachmentId) {
        return;
      }

      try {
        await sendTerminalData(activeAgentRun.terminalAttachmentId, data);
      } catch (error) {
        console.error("[CommentPanel] failed to send terminal data:", error);
        showToast("Couldn't send terminal input");
      }
    },
    [activeAgentRun?.terminalAttachmentId, showToast],
  );

  const handleTerminalResize = useCallback(
    async (dimensions: { cols: number; rows: number }) => {
      if (!activeAgentRun?.terminalAttachmentId) {
        return;
      }

      try {
        await resizeTerminal(activeAgentRun.terminalAttachmentId, dimensions);
      } catch (error) {
        console.error("[CommentPanel] failed to resize terminal:", error);
      }
    },
    [activeAgentRun?.terminalAttachmentId],
  );

  useEffect(() => {
    if (
      peerMode ||
      !agentCapability.canRunAgent ||
      !activeAgentRun?.terminalAttachmentId ||
      !ACTIVE_AGENT_RUN_STATUSES.has(activeAgentRun.status)
    ) {
      return;
    }

    function syncStatus() {
      syncActiveAgentRunStatus().catch((error) => {
        console.error("[CommentPanel] failed to sync agent run:", error);
      });
    }

    syncStatus();
    const intervalId = window.setInterval(syncStatus, 2000);
    return () => window.clearInterval(intervalId);
  }, [
    activeAgentRun?.id,
    activeAgentRun?.status,
    activeAgentRun?.terminalAttachmentId,
    agentCapability.canRunAgent,
    peerMode,
    syncActiveAgentRunStatus,
  ]);

  useEffect(() => {
    setAgentRunTerminalOpen(false);
  }, [activeAgentRunId]);

  useEffect(() => {
    if (peerMode) {
      return;
    }

    let cancelled = false;
    getAgentRuntimeCapability()
      .then((capability) => {
        if (
          !cancelled &&
          (capability.canRunAgent !== INITIAL_AGENT_CAPABILITY.canRunAgent ||
            capability.unavailableMessage !==
              INITIAL_AGENT_CAPABILITY.unavailableMessage)
        ) {
          setAgentCapability(capability);
        }
      })
      .catch((error) => {
        console.error("[CommentPanel] failed to read agent capability:", error);
        if (!cancelled) {
          setAgentCapability({
            canRunAgent: false,
            unavailableMessage: "Agent runtime availability check failed.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [agentSettingsOpen, peerMode]);

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
    if (el && typeof el.scrollIntoView === "function") {
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
  const showTypeFilters = activeTypes.length > 0;

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

      {showAgentRunStatus && (
        <div className="comment-panel__agent-run" role="status">
          <div className="comment-panel__agent-run-copy">
            <span className="comment-panel__agent-run-label">
              Agent {AGENT_RUN_STATUS_LABEL[activeAgentRun.status]}
            </span>
            {activeAgentRunScope && (
              <span className="comment-panel__agent-run-scope">
                {activeAgentRunScope}
              </span>
            )}
            <div
              className="comment-panel__agent-steps"
              aria-label="Agent run progress"
            >
              <span className="is-done">Preparing</span>
              <span
                className={activeAgentRun.status === "queued" ? "" : "is-done"}
              >
                Editing
              </span>
              <span
                className={
                  !ACTIVE_AGENT_RUN_STATUSES.has(activeAgentRun.status)
                    ? "is-done"
                    : ""
                }
              >
                Review
              </span>
            </div>
            {activeAgentRun.errorMessage && (
              <span className="comment-panel__agent-run-error">
                {activeAgentRun.errorMessage}
              </span>
            )}
            {agentRunTerminalOpen && canAttachActiveTerminal && (
              <AgentTerminal
                runId={activeAgentRun.terminalAttachmentId}
                output={activeAgentRun.output}
                onData={handleTerminalData}
                onResize={handleTerminalResize}
              />
            )}
          </div>
          <div className="comment-panel__agent-run-actions">
            {canAttachActiveTerminal && (
              <button
                className="comment-panel__agent-run-action"
                onClick={toggleAgentRunTerminal}
              >
                {agentRunTerminalOpen ? "Hide terminal" : "Show terminal"}
              </button>
            )}
            {activeAgentRun.prompt && (
              <button
                className="comment-panel__agent-run-action"
                onClick={() => {
                  void handleCopyActiveRunPrompt();
                }}
              >
                Copy prompt
              </button>
            )}
            {activeAgentRun.output && (
              <button
                className="comment-panel__agent-run-action"
                onClick={() => {
                  void handleCopyAgentRunOutput(activeAgentRun);
                }}
              >
                Copy output
              </button>
            )}
            {canStopAgentRun ? (
              <button
                className="comment-panel__agent-run-action"
                onClick={() => {
                  void handleStopAgentRun();
                }}
              >
                Stop
              </button>
            ) : (
              <button
                className="comment-panel__agent-run-action"
                onClick={() => clearAgentRun(activeAgentRun.id)}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {showAgentRunHistory && (
        <div
          className="comment-panel__agent-history"
          aria-label="Recent agent runs"
        >
          <div className="comment-panel__agent-history-title">
            Recent agent runs
          </div>
          {visibleAgentRunHistory.map((run) => (
            <div key={run.id} className="comment-panel__agent-history-item">
              <div className="comment-panel__agent-history-copy">
                <span className="comment-panel__agent-history-label">
                  {AGENT_RUN_STATUS_LABEL[run.status]}
                </span>
                <span className="comment-panel__agent-history-scope">
                  {formatAgentRunScope(run)}
                </span>
                {run.errorMessage && (
                  <span className="comment-panel__agent-history-error">
                    {run.errorMessage}
                  </span>
                )}
              </div>
              <div className="comment-panel__agent-history-actions">
                {run.prompt && (
                  <button
                    className="comment-panel__agent-run-action"
                    onClick={() => {
                      void handleCopyAgentRunPrompt(run);
                    }}
                  >
                    Copy prompt
                  </button>
                )}
                {run.output && (
                  <button
                    className="comment-panel__agent-run-action"
                    onClick={() => {
                      void handleCopyAgentRunOutput(run);
                    }}
                  >
                    Copy output
                  </button>
                )}
                <button
                  className="comment-panel__agent-run-action"
                  onClick={() => clearAgentRun(run.id)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAgentCapabilityWarning && (
        <div className="comment-panel__agent-capability" role="status">
          <span>{agentCapability.unavailableMessage}</span>
          <button
            className="comment-panel__agent-capability-action"
            onClick={openAgentSettings}
          >
            Set up
          </button>
        </div>
      )}

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

// ── Inline edit/delete state per entry ─────────────────────────────

function InlineEditForm({
  comment,
  onSave,
  onCancel,
}: {
  comment: { type: CommentType; text: string };
  onSave: (type: CommentType, text: string) => void;
  onCancel: () => void;
}) {
  const [editType, setEditType] = useState<CommentType>(
    normalizeUserCommentType(comment.type),
  );
  const [editText, setEditText] = useState(comment.text);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!editText.trim()) {
      return;
    }
    onSave(editType, editText.trim());
  }

  return (
    <form
      className="comment-panel__inline-edit"
      onSubmit={handleSubmit}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="comment-add-form__types">
        {USER_COMMENT_TYPES.map((commentType) => (
          <button
            key={commentType}
            type="button"
            className={`comment-add-form__type${editType === commentType ? " comment-add-form__type--active" : ""}`}
            data-comment-type={commentType}
            aria-pressed={editType === commentType}
            onClick={() => setEditType(commentType)}
          >
            {commentType}
          </button>
        ))}
      </div>
      <textarea
        className="comment-add-form__input"
        aria-label="Comment text"
        value={editText}
        onChange={(event) => setEditText(event.target.value)}
        rows={2}
        autoFocus
      />
      <div className="comment-add-form__actions">
        <button
          type="submit"
          className="comment-add-form__save"
          disabled={!editText.trim()}
        >
          Save
        </button>
        <button
          type="button"
          className="comment-add-form__cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function InlineDeleteConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="comment-panel__inline-confirm"
      onClick={(event) => event.stopPropagation()}
    >
      <span>Delete this comment?</span>
      <div className="comment-add-form__actions">
        <button className="comment-card__confirm-yes" onClick={onConfirm}>
          Delete
        </button>
        <button className="comment-add-form__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Entry with actions ─────────────────────────────────────────────

function CommentEntry({
  comment,
  isActive,
  isOtherFile,
  canEdit,
  answered,
  resolved = false,
  onClick,
  onEdit,
  onDelete,
}: {
  comment: Comment | DisplayComment;
  isActive: boolean;
  isOtherFile: boolean;
  canEdit: boolean;
  answered: boolean;
  resolved?: boolean;
  onClick: () => void;
  onEdit?: (id: string, type: CommentType, text: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const setHighlight = useAppStore((state) => state.setHoveredBlockHighlight);

  const isFullComment = "criticType" in comment;
  const label =
    comment.text ||
    (isFullComment ? comment.highlightedText : undefined) ||
    (isFullComment ? comment.from : undefined) ||
    "";
  const displayText = label.length > 72 ? label.slice(0, 72) + "…" : label;
  const quote = isFullComment
    ? (comment.anchor?.quote ?? comment.highlightedText)
    : comment.quote;
  const displayQuote =
    quote && quote.length > 72 ? quote.slice(0, 72) + "…" : quote;
  const isEditable =
    canEdit &&
    (!isFullComment ||
      !comment.criticType ||
      (canEditComment(comment) &&
        EDITABLE_CRITIC_TYPES.includes(comment.criticType)));

  if (editing) {
    return (
      <div className="comment-panel__entry comment-panel__entry--editing">
        <InlineEditForm
          comment={comment}
          onSave={(type, text) => {
            onEdit?.(comment.id, type, text);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="comment-panel__entry comment-panel__entry--editing">
        <InlineDeleteConfirm
          onConfirm={() => {
            onDelete?.(comment.id);
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      </div>
    );
  }

  return (
    <div
      data-comment-id={comment.id}
      data-comment-type={comment.type}
      role="button"
      tabIndex={0}
      className={`comment-panel__entry${isActive ? " comment-panel__entry--active" : ""}${isOtherFile ? " comment-panel__entry--other-file" : ""}${resolved ? " comment-panel__entry--resolved" : ""}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onClick();
        }
      }}
      onMouseEnter={() => {
        if (!isOtherFile && comment.blockIndex !== undefined) {
          setHighlight({
            blockIndex: comment.blockIndex,
            commentType: comment.type,
          });
        }
      }}
      onMouseLeave={() => setHighlight(null)}
    >
      <span className="comment-panel__badge">{comment.type}</span>
      <span className="comment-panel__author">
        {isFullComment
          ? (comment.thread?.authorLabel ?? "You")
          : comment.authorLabel}
      </span>
      {!isFullComment && (
        <span className="comment-panel__time">
          {formatRelativeTime(comment.createdAt)}
        </span>
      )}
      {answered && (
        <span
          className="comment-panel__status"
          title="This question has an answer"
        >
          answered
        </span>
      )}
      {resolved && <span className="comment-panel__status">resolved</span>}
      {canEdit && (
        <span
          className="comment-panel__entry-actions"
          onClick={(event) => event.stopPropagation()}
        >
          {isEditable && (
            <button
              className="comment-panel__entry-edit"
              onClick={() => setEditing(true)}
              aria-label="Edit comment"
            >
              Edit
            </button>
          )}
          <button
            className="comment-panel__entry-delete"
            onClick={() => setConfirming(true)}
            aria-label="Delete comment"
          >
            Del
          </button>
        </span>
      )}
      {displayQuote && (
        <span className="comment-panel__quote">“{displayQuote}”</span>
      )}
      <span className="comment-panel__text">{displayText}</span>
      {isFullComment && comment.anchor?.orphaned ? (
        <span className="comment-panel__orphan">
          ⚠ text changed underneath — anchor released, quote kept
        </span>
      ) : null}
    </div>
  );
}

// ── Cross-file list ────────────────────────────────────────────────

function CrossFileList({
  entries,
  activeFilePath,
  activeCommentId,
  onEntryClick,
  onCrossFileClick,
  onEdit,
  onDelete,
  answeredCommentIdsByPath,
}: {
  entries: {
    filePath: string;
    fileName: string;
    comments: (Comment | DisplayComment)[];
  }[];
  activeFilePath: string | null;
  activeCommentId: string | null;
  onEntryClick: (id: string, blockIndex: number | undefined) => void;
  onCrossFileClick: (filePath: string, rawStart: number) => void;
  onEdit: (id: string, type: CommentType, text: string) => void;
  onDelete: (id: string) => void;
  answeredCommentIdsByPath: ReadonlyMap<string, ReadonlySet<string>>;
}) {
  const totalCount = entries.reduce(
    (sum, entry) => sum + entry.comments.length,
    0,
  );

  if (totalCount === 0) {
    return <p className="comment-panel__empty">No comments across files.</p>;
  }

  return (
    <>
      {entries.map((entry) => {
        const isActiveFile = entry.filePath === activeFilePath;
        return (
          <div key={entry.filePath}>
            <div className="comment-panel__file-header">
              <span className="comment-panel__file-name" title={entry.filePath}>
                {entry.filePath}
              </span>
              <span className="comment-panel__file-count">
                {entry.comments.length}
              </span>
            </div>
            {entry.comments.map((comment) => {
              const rawStart = "rawStart" in comment ? comment.rawStart : 0;
              const canEdit = true;
              const answeredCommentIds =
                answeredCommentIdsByPath.get(entry.filePath) ??
                EMPTY_ANSWERED_COMMENT_IDS;
              return (
                <CommentEntry
                  key={`${entry.filePath}:${comment.id}`}
                  comment={comment}
                  isActive={isActiveFile && activeCommentId === comment.id}
                  isOtherFile={!isActiveFile}
                  canEdit={canEdit}
                  answered={answeredCommentIds.has(comment.id)}
                  onClick={() => {
                    if (isActiveFile) {
                      onEntryClick(comment.id, comment.blockIndex);
                    } else {
                      onCrossFileClick(entry.filePath, rawStart);
                    }
                  }}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// ── Single-file list ───────────────────────────────────────────────

function SingleFileList({
  visible,
  peerMode,
  activeCommentId,
  sourceComments,
  onEntryClick,
  onEdit,
  onDelete,
  answeredCommentIds,
  resolvedView = false,
}: {
  visible: (Comment | DisplayComment)[];
  peerMode: boolean;
  activeCommentId: string | null;
  sourceComments: (Comment | DisplayComment)[];
  onEntryClick: (id: string, blockIndex: number | undefined) => void;
  onEdit: (id: string, type: CommentType, text: string) => void;
  onDelete: (id: string) => void;
  answeredCommentIds: ReadonlySet<string>;
  resolvedView?: boolean;
}) {
  if (visible.length === 0) {
    return (
      <p className="comment-panel__empty">
        {sourceComments.length === 0
          ? peerMode
            ? "No comments yet."
            : "No comments in this document."
          : "No comments match the filter."}
      </p>
    );
  }

  return (
    <>
      {visible.map((comment) => (
        <CommentEntry
          key={comment.id}
          comment={comment}
          isActive={activeCommentId === comment.id}
          isOtherFile={false}
          canEdit={!resolvedView}
          resolved={resolvedView}
          answered={answeredCommentIds.has(comment.id)}
          onClick={() => onEntryClick(comment.id, comment.blockIndex)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}
