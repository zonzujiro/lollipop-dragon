import { useEffect } from "react";
import { useAppStore } from "../../store";

export function useKeyboardShortcuts() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  useEffect(() => {
    const removeTab = useAppStore.getState().removeTab;
    const switchTab = useAppStore.getState().switchTab;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) {
        return;
      }
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const targetAcceptsText =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      const state = useAppStore.getState();
      if (meta && key === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (meta && key === "\\") {
        e.preventDefault();
        state.toggleCommentPanel();
        return;
      }
      if (meta && key === "t") {
        e.preventDefault();
        void state.openFileInNewTab();
        return;
      }
      if (meta && key === "enter" && !targetAcceptsText) {
        e.preventDefault();
        void state.startAddressCommentsAgentRun().then((result) => {
          if (result.status === "unavailable") {
            useAppStore.getState().showToast(result.message);
          }
        });
        return;
      }
      if (meta && key === "w") {
        e.preventDefault();
        const { activeTabId } = useAppStore.getState();
        if (activeTabId) {
          removeTab(activeTabId);
        }
        return;
      }
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (state.tabs.length < 2) {
          return;
        }
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
        const next = e.shiftKey
          ? (idx - 1 + state.tabs.length) % state.tabs.length
          : (idx + 1) % state.tabs.length;
        void switchTab(state.tabs[next].id);
        return;
      }
      if (targetAcceptsText || state.isPeerMode || meta) {
        return;
      }
      const tab = state.tabs.find(
        (candidate) => candidate.id === state.activeTabId,
      );
      if (!tab) {
        return;
      }
      if (key === "c") {
        e.preventDefault();
        const activeComment = tab.comments.find(
          (comment) => comment.id === tab.activeCommentId,
        );
        window.dispatchEvent(
          new CustomEvent("markreview:open-composer", {
            detail: { blockIndex: activeComment?.blockIndex ?? 0 },
          }),
        );
        return;
      }
      if (key !== "j" && key !== "k") {
        return;
      }
      e.preventDefault();
      const orderedComments = Object.values(tab.allFileComments)
        .sort((left, right) => left.filePath.localeCompare(right.filePath))
        .flatMap((entry) =>
          [...entry.comments]
            .sort((left, right) => {
              const blockDifference =
                (left.blockIndex ?? 0) - (right.blockIndex ?? 0);
              return (
                blockDifference ||
                (left.anchor?.start ?? -1) - (right.anchor?.start ?? -1) ||
                left.rawStart - right.rawStart
              );
            })
            .map((comment) => ({ comment, filePath: entry.filePath })),
        );
      if (orderedComments.length === 0) {
        return;
      }
      const activePath = tab.activeFilePath ?? tab.fileName ?? "";
      const activeComment = tab.comments.find(
        (comment) => comment.id === tab.activeCommentId,
      );
      const activeIndex = activeComment
        ? orderedComments.findIndex(
            (entry) =>
              entry.filePath === activePath &&
              entry.comment.rawStart === activeComment.rawStart,
          )
        : -1;
      const direction = key === "j" ? 1 : -1;
      const nextIndex =
        activeIndex < 0
          ? direction > 0
            ? 0
            : orderedComments.length - 1
          : (activeIndex + direction + orderedComments.length) %
            orderedComments.length;
      const nextEntry = orderedComments[nextIndex];
      if (nextEntry) {
        state.navigateToComment(nextEntry.filePath, nextEntry.comment.rawStart);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
}
