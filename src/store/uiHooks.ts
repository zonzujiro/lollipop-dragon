import { useShallow } from "zustand/react/shallow";
import { getActiveAgentRunForTab } from "../modules/agent-workflow";
import { getActiveTab } from "../modules/workspace/helpers";
import type { PeerComment } from "../types/share";
import { useAppStore } from ".";

const EMPTY_PEER_COMMENTS: PeerComment[] = [];

export function useCommentPanelStore(tabId: string | null) {
  return useAppStore(
    useShallow((state) => ({
      peerActiveCommentId: state.peerActiveCommentId,
      setActiveCommentId: state.setActiveCommentId,
      setCommentFilter: state.setCommentFilter,
      showToast: state.showToast,
      openAgentSettings: state.openAgentSettings,
      agentSettingsOpen: state.agentSettingsOpen,
      myPeerComments: state.myPeerComments,
      peerActiveFilePath: state.peerActiveFilePath,
      navigateToComment: state.navigateToComment,
      editComment: state.editComment,
      deleteComment: state.deleteComment,
      replyToCommentThread: state.replyToCommentThread,
      editPeerComment: state.editPeerComment,
      deletePeerComment: state.deletePeerComment,
      selectPeerFile: state.selectPeerFile,
      stopActiveAgentRun: state.stopActiveAgentRun,
      syncActiveAgentRunStatus: state.syncActiveAgentRunStatus,
      clearAgentRun: state.clearAgentRun,
      activeAgentRun: tabId ? getActiveAgentRunForTab(state, tabId) : null,
      agentRuns: state.agentRuns,
      activeAgentRunIdByTabId: state.activeAgentRunIdByTabId,
      sharedContent: state.sharedContent,
    })),
  );
}

export function useCommentMarginStore() {
  return useAppStore(
    useShallow((state) => {
      const tab = getActiveTab(state);
      const pendingComments = tab?.activeDocId
        ? (tab.pendingComments[tab.activeDocId] ?? EMPTY_PEER_COMMENTS)
        : EMPTY_PEER_COMMENTS;
      const currentPath = tab?.activeFilePath ?? tab?.fileName ?? "";
      const visiblePendingComments = currentPath
        ? pendingComments.filter((comment) => comment.path === currentPath)
        : pendingComments;

      return {
        peerActiveCommentId: state.peerActiveCommentId,
        peerCommentPanelOpen: state.peerCommentPanelOpen,
        setActiveCommentId: state.setActiveCommentId,
        toggleCommentPanel: state.toggleCommentPanel,
        hostPendingPeerComments:
          visiblePendingComments.length > 0
            ? visiblePendingComments
            : EMPTY_PEER_COMMENTS,
        documentUpdateAvailable: state.documentUpdateAvailable,
        peerDraftCommentOpen: state.peerDraftCommentOpen,
        setPeerDraftCommentOpen: state.setPeerDraftCommentOpen,
        myPeerComments: state.myPeerComments,
        peerActiveFilePath: state.peerActiveFilePath,
      };
    }),
  );
}

export function usePeerMarkdownStore() {
  return useAppStore(
    useShallow((state) => ({
      rawContent: state.peerRawContent,
      fileName: state.peerFileName,
      activeFilePath: state.peerActiveFilePath,
    })),
  );
}

export function useMarkdownRendererStore(hostTabId: string | null) {
  return useAppStore(
    useShallow((state) => ({
      setComments: state.setComments,
      addComment: state.addComment,
      postPeerComment: state.postPeerComment,
      reopenTab: state.reopenTab,
      openDirectoryInNewTab: state.openDirectoryInNewTab,
      openFileInNewTab: state.openFileInNewTab,
      clearPendingScrollTarget: state.clearPendingScrollTarget,
      setActiveCommentId: state.setActiveCommentId,
      showToast: state.showToast,
      peerActiveCommentId: state.peerActiveCommentId,
      myPeerComments: state.myPeerComments,
      activeAgentRun: hostTabId
        ? getActiveAgentRunForTab(state, hostTabId)
        : null,
      hoveredBlockHighlight: state.hoveredBlockHighlight,
    })),
  );
}

export function usePeerMode(): boolean {
  return useAppStore((state) => state.isPeerMode);
}
