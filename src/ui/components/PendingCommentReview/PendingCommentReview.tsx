import "./PendingCommentReview.css";
import { useEffect, useMemo, useState } from "react";
import { buildPendingPeerCommentsAgentPrompt } from "../../../markup";
import {
  getActiveAgentRunForTab,
  getPendingPeerCommentTargets,
} from "../../../modules/agent-workflow";
import type { AgentRunStatus } from "../../../modules/agent-workflow";
import { canRunAgent, getAgentRuntimeCapability } from "../../../runtime";
import type { AgentRuntimeCapability } from "../../../runtime";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";
import type { PeerComment } from "../../../types/share";
import { getPeerCommentsAgentAction } from "../../agentActions";
import { PeerCommentCard } from "../PeerCommentCard";

interface Props {
  docId: string;
}

const ACTIVE_AGENT_RUN_STATUSES = new Set<AgentRunStatus>([
  "queued",
  "running",
  "needs_attention",
]);
const INITIAL_AGENT_CAPABILITY: AgentRuntimeCapability = {
  canRunAgent: false,
  unavailableMessage: canRunAgent
    ? null
    : "Local agent execution is unavailable on web.",
};
const EMPTY_PEER_COMMENTS: PeerComment[] = [];

export function PendingCommentReview({ docId }: Props) {
  const tab = useActiveTab();
  const pendingComments = tab?.pendingComments ?? {};
  const mergeComment = useAppStore((state) => state.mergeComment);
  const clearPendingComments = useAppStore(
    (state) => state.clearPendingComments,
  );
  const showToast = useAppStore((state) => state.showToast);
  const openAgentSettings = useAppStore((state) => state.openAgentSettings);
  const agentSettingsOpen = useAppStore((state) => state.agentSettingsOpen);
  const startPeerCommentsAgentRun = useAppStore(
    (state) => state.startPeerCommentsAgentRun,
  );
  const activeAgentRun = useAppStore((state) =>
    tab?.id ? getActiveAgentRunForTab(state, tab.id) : null,
  );
  const activeFilePath = tab?.activeFilePath ?? null;
  const fileName = tab?.fileName ?? null;
  const [agentCapability, setAgentCapability] = useState(
    INITIAL_AGENT_CAPABILITY,
  );

  const comments = pendingComments[docId] ?? EMPTY_PEER_COMMENTS;
  const currentPath = activeFilePath ?? fileName ?? "";
  const pendingTargets = useMemo(
    () => getPendingPeerCommentTargets(comments),
    [comments],
  );
  const canStopAgentRun = Boolean(
    activeAgentRun && ACTIVE_AGENT_RUN_STATUSES.has(activeAgentRun.status),
  );
  const shouldPromptAgentSetup = canRunAgent && !agentCapability.canRunAgent;
  const peerCommentsAgentAction = getPeerCommentsAgentAction({
    canRunAgent: agentCapability.canRunAgent || shouldPromptAgentSetup,
    canStartPeerCommentsRun: comments.length > 0 && !canStopAgentRun,
  });

  async function handleMergeAll() {
    for (const comment of comments) {
      await mergeComment(docId, comment);
    }
  }

  async function handleCopyPeerCommentsPrompt() {
    try {
      await navigator.clipboard.writeText(
        buildPendingPeerCommentsAgentPrompt({
          targets: pendingTargets,
        }),
      );
      showToast("Agent prompt copied");
    } catch (error) {
      console.error(
        "[PendingCommentReview] failed to copy agent prompt:",
        error,
      );
      showToast("Couldn't copy agent prompt");
    }
  }

  async function handlePeerCommentsAgentAction() {
    if (peerCommentsAgentAction.kind === "copy_prompt") {
      await handleCopyPeerCommentsPrompt();
      return;
    }

    const result = await startPeerCommentsAgentRun(docId);
    if (result.status === "unavailable") {
      if (canRunAgent && result.reason === "agent_unavailable") {
        openAgentSettings();
        return;
      }
      showToast(result.message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    getAgentRuntimeCapability()
      .then((capability) => {
        if (!cancelled) {
          setAgentCapability(capability);
        }
      })
      .catch((error) => {
        console.error(
          "[PendingCommentReview] failed to read agent capability:",
          error,
        );
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
  }, [agentSettingsOpen]);

  if (comments.length === 0) {
    return <p className="pending-review__empty">No pending comments.</p>;
  }

  return (
    <div className="pending-review">
      <div className="pending-review__toolbar">
        <span className="pending-review__count">
          {comments.length} comment{comments.length !== 1 ? "s" : ""}
        </span>
        {!canStopAgentRun && (
          <button
            className="pending-review__btn"
            onClick={() => {
              void handlePeerCommentsAgentAction();
            }}
            title={peerCommentsAgentAction.title}
          >
            {peerCommentsAgentAction.label}
          </button>
        )}
        <button
          className="pending-review__btn pending-review__btn--merge-all"
          onClick={() => {
            void handleMergeAll();
          }}
        >
          Merge all
        </button>
        <button
          className="pending-review__btn pending-review__btn--clear"
          onClick={() => clearPendingComments(docId)}
        >
          Clear all
        </button>
      </div>

      <div className="pending-review__list">
        {comments.map((comment) => (
          <PeerCommentCard
            key={comment.id}
            docId={docId}
            comment={comment}
            currentPath={currentPath}
          />
        ))}
      </div>
    </div>
  );
}
