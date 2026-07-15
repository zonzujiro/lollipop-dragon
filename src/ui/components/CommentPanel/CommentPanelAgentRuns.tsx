import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFinishedAgentRunHistoryForTab } from "../../../modules/agent-workflow";
import type {
  AgentRun,
  AgentRunStatus,
  AgentRunStopResult,
  AgentRunSyncStatusResult,
} from "../../../modules/agent-workflow";
import {
  canRunAgent,
  canShowTerminal,
  getAgentRuntimeCapability,
  resizeTerminal,
  sendTerminalData,
} from "../../../runtime";
import { AgentTerminal } from "../AgentTerminal";
import {
  ACTIVE_AGENT_RUN_STATUSES,
  AGENT_RUN_STATUS_LABEL,
  EMPTY_AGENT_RUNS,
  INITIAL_AGENT_CAPABILITY,
  formatAgentRunScope,
  getCompletedAgentRunMessage,
} from "./commentPanelModel";

interface CommentPanelAgentRunsProps {
  activeAgentRun: AgentRun | null;
  activeAgentRunIdByTabId: Record<string, string>;
  agentRuns: Record<string, AgentRun>;
  agentSettingsOpen: boolean;
  clearAgentRun: (runId: string) => void;
  onOpenAgentSettings: () => void;
  peerMode: boolean;
  showToast: (message: string) => void;
  stopActiveAgentRun: () => Promise<AgentRunStopResult>;
  syncActiveAgentRunStatus: () => Promise<AgentRunSyncStatusResult>;
  tabId: string | null;
}

async function copyRunText(input: {
  text: string;
  successMessage: string;
  failureMessage: string;
  showToast: (message: string) => void;
}): Promise<void> {
  try {
    await navigator.clipboard.writeText(input.text);
    input.showToast(input.successMessage);
  } catch (error) {
    console.error("[CommentPanel] failed to copy agent run text:", error);
    input.showToast(input.failureMessage);
  }
}

export function CommentPanelAgentRuns({
  activeAgentRun,
  activeAgentRunIdByTabId,
  agentRuns,
  agentSettingsOpen,
  clearAgentRun,
  onOpenAgentSettings,
  peerMode,
  showToast,
  stopActiveAgentRun,
  syncActiveAgentRunStatus,
  tabId,
}: CommentPanelAgentRunsProps) {
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [agentCapability, setAgentCapability] = useState(
    INITIAL_AGENT_CAPABILITY,
  );
  const previousRunRef = useRef<{
    id: string;
    status: AgentRunStatus;
  } | null>(null);
  const activeRunId = activeAgentRun?.id ?? null;
  const history = useMemo(
    () =>
      tabId
        ? getFinishedAgentRunHistoryForTab(
            { agentRuns, activeAgentRunIdByTabId },
            tabId,
          ).filter((run) => run.id !== activeRunId)
        : EMPTY_AGENT_RUNS,
    [activeAgentRunIdByTabId, activeRunId, agentRuns, tabId],
  );
  const canStop = Boolean(
    activeAgentRun && ACTIVE_AGENT_RUN_STATUSES.has(activeAgentRun.status),
  );
  const canAttachTerminal = Boolean(
    canShowTerminal && activeAgentRun?.terminalAttachmentId,
  );

  useEffect(() => {
    const previousRun = previousRunRef.current;
    if (
      activeAgentRun &&
      previousRun?.id === activeAgentRun.id &&
      ACTIVE_AGENT_RUN_STATUSES.has(previousRun.status) &&
      !ACTIVE_AGENT_RUN_STATUSES.has(activeAgentRun.status)
    ) {
      const message = getCompletedAgentRunMessage(activeAgentRun.status);
      if (message) {
        showToast(message);
      }
    }
    previousRunRef.current = activeAgentRun
      ? { id: activeAgentRun.id, status: activeAgentRun.status }
      : null;
  }, [activeAgentRun, showToast]);

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
      syncActiveAgentRunStatus().catch((error: unknown) => {
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

  useEffect(() => setTerminalOpen(false), [activeRunId]);

  useEffect(() => {
    if (peerMode) {
      return;
    }
    let cancelled = false;
    getAgentRuntimeCapability()
      .then((capability) => {
        if (!cancelled) {
          setAgentCapability(capability);
        }
      })
      .catch((error: unknown) => {
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

  if (peerMode) {
    return null;
  }

  return (
    <>
      {activeAgentRun && (
        <div className="comment-panel__agent-run" role="status">
          <div className="comment-panel__agent-run-copy">
            <span className="comment-panel__agent-run-label">
              Agent {AGENT_RUN_STATUS_LABEL[activeAgentRun.status]}
            </span>
            <span className="comment-panel__agent-run-scope">
              {formatAgentRunScope(activeAgentRun)}
            </span>
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
            {terminalOpen &&
              canAttachTerminal &&
              activeAgentRun.terminalAttachmentId && (
                <AgentTerminal
                  runId={activeAgentRun.terminalAttachmentId}
                  output={activeAgentRun.output}
                  onData={handleTerminalData}
                  onResize={handleTerminalResize}
                />
              )}
          </div>
          <div className="comment-panel__agent-run-actions">
            {canAttachTerminal && (
              <button
                className="comment-panel__agent-run-action"
                onClick={() => setTerminalOpen((open) => !open)}
              >
                {terminalOpen ? "Hide terminal" : "Show terminal"}
              </button>
            )}
            {activeAgentRun.prompt && (
              <button
                className="comment-panel__agent-run-action"
                onClick={() =>
                  void copyRunText({
                    text: activeAgentRun.prompt,
                    successMessage: "Agent run prompt copied",
                    failureMessage: "Couldn't copy agent prompt",
                    showToast,
                  })
                }
              >
                Copy prompt
              </button>
            )}
            {activeAgentRun.output && (
              <button
                className="comment-panel__agent-run-action"
                onClick={() =>
                  void copyRunText({
                    text: activeAgentRun.output,
                    successMessage: "Agent run output copied",
                    failureMessage: "Couldn't copy agent output",
                    showToast,
                  })
                }
              >
                Copy output
              </button>
            )}
            {canStop ? (
              <button
                className="comment-panel__agent-run-action"
                onClick={() =>
                  void stopActiveAgentRun().then((result) => {
                    if (result.status === "unavailable") {
                      showToast(result.message);
                    }
                  })
                }
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
      {history.length > 0 && (
        <div
          className="comment-panel__agent-history"
          aria-label="Recent agent runs"
        >
          <div className="comment-panel__agent-history-title">
            Recent agent runs
          </div>
          {history.map((run) => (
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
                    onClick={() =>
                      void copyRunText({
                        text: run.prompt,
                        successMessage: "Agent run prompt copied",
                        failureMessage: "Couldn't copy agent prompt",
                        showToast,
                      })
                    }
                  >
                    Copy prompt
                  </button>
                )}
                {run.output && (
                  <button
                    className="comment-panel__agent-run-action"
                    onClick={() =>
                      void copyRunText({
                        text: run.output,
                        successMessage: "Agent run output copied",
                        failureMessage: "Couldn't copy agent output",
                        showToast,
                      })
                    }
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
      {canRunAgent &&
        !agentCapability.canRunAgent &&
        agentCapability.unavailableMessage && (
          <div className="comment-panel__agent-capability" role="status">
            <span>{agentCapability.unavailableMessage}</span>
            <button
              className="comment-panel__agent-capability-action"
              onClick={onOpenAgentSettings}
            >
              Set up
            </button>
          </div>
        )}
    </>
  );
}
