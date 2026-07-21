import { buildCommentThreadGroups } from "../../../markup";
import type { CommentThreadGroup } from "../../../markup";
import type { AgentRun, AgentRunStatus } from "../../../modules/agent-workflow";
import { canRunAgent } from "../../../runtime";
import type { AgentRuntimeCapability } from "../../../runtime";
import type { Comment, CommentType } from "../../../types/criticmarkup";
import type { PeerComment } from "../../../types/share";
import type { TabState } from "../../../types/tab";

export const ACTIVE_AGENT_RUN_STATUSES = new Set<AgentRunStatus>([
  "queued",
  "running",
  "needs_attention",
]);
export const AGENT_RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: "Queued",
  running: "Running",
  needs_attention: "Needs attention",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};
export const AGENT_RUN_TASK_LABEL = {
  address_comments: "Address comments",
  answer_questions: "Answer questions",
  review_peer_comments: "Review peer comments",
};
export const EMPTY_COMMENTS: Comment[] = [];
export const EMPTY_FILE_TREE: TabState["fileTree"] = [];
export const EMPTY_ALL_FILE_COMMENTS: TabState["allFileComments"] = {};
export const EMPTY_AGENT_RUNS: AgentRun[] = [];
export const EMPTY_ANSWERED_COMMENT_IDS = new Set<string>();
export const EMPTY_ANSWERED_COMMENT_IDS_BY_PATH = new Map<
  string,
  ReadonlySet<string>
>();
export const EMPTY_THREAD_GROUPS: CommentThreadGroup[] = [];
export const EMPTY_THREAD_GROUPS_BY_PATH = new Map<
  string,
  readonly CommentThreadGroup[]
>();
export const INITIAL_AGENT_CAPABILITY: AgentRuntimeCapability = {
  canRunAgent: false,
  unavailableMessage: canRunAgent
    ? null
    : "Local agent execution is unavailable on web.",
};

export function getCompletedAgentRunMessage(
  status: AgentRunStatus,
): string | null {
  if (status === "completed") {
    return "Agent run complete · review the updated file";
  }
  if (status === "failed") {
    return "Agent run failed · open the run card for details";
  }
  if (status === "stopped") {
    return "Agent run stopped";
  }
  return null;
}

export function scrollToBlock(blockIndex: number | undefined) {
  if (blockIndex === undefined) {
    return;
  }
  document
    .querySelector(`[data-block-index="${blockIndex}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export interface DisplayComment {
  id: string;
  type: CommentType;
  text: string;
  blockIndex: number | undefined;
  quote: string | undefined;
  authorLabel: string;
  createdAt: string;
}

export function formatRelativeTime(createdAt: string): string {
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

export function peerCommentToDisplay(comment: PeerComment): DisplayComment {
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

export function formatAgentRunTargets(targetPaths: string[]): string {
  if (targetPaths.length === 0) {
    return "No target";
  }
  if (targetPaths.length === 1) {
    return targetPaths[0];
  }
  return `${targetPaths[0]} +${targetPaths.length - 1} more`;
}

export function formatAgentRunCommentCount(commentCount: number): string {
  if (commentCount === 0) {
    return "no comments";
  }
  if (commentCount === 1) {
    return "1 comment";
  }
  return `${commentCount} comments`;
}

export function formatAgentRunScope(run: AgentRun): string {
  return `${AGENT_RUN_TASK_LABEL[run.taskKind]} · ${formatAgentRunTargets(
    run.targetPaths,
  )} · ${formatAgentRunCommentCount(run.selectedCommentIds.length)}`;
}

export interface CrossFileEntry<C extends { type: CommentType }> {
  filePath: string;
  fileName: string;
  comments: C[];
}

export function filterCrossFileByType<C extends { type: CommentType }>(
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

export function getRootOnlyComments(comments: Comment[]): Comment[] {
  return buildCommentThreadGroups(comments).map((group) => group.root);
}

export function getAnsweredQuestionIds(
  comments: Comment[],
): ReadonlySet<string> {
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

export function getThreadGroupsByPath(
  allFileComments: TabState["allFileComments"],
): ReadonlyMap<string, readonly CommentThreadGroup[]> {
  const byPath = new Map<string, readonly CommentThreadGroup[]>();
  for (const entry of Object.values(allFileComments)) {
    byPath.set(entry.filePath, buildCommentThreadGroups(entry.comments));
  }
  return byPath;
}

export function getActiveRootCommentId(
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
