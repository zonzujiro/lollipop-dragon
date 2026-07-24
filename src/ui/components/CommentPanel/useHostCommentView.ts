import { useState } from "react";
import type { HostCommentFilter } from "../../../modules/host-review/types";
import type { CommentType } from "../../../types/criticmarkup";
import type { HostCommentView } from "./CommentPanelFilters";

interface Options {
  effectiveCommentFilter: CommentType | "all" | "resolved";
  incomingCount: number;
  peerMode: boolean;
  setCommentFilter: (filter: HostCommentFilter) => void;
}

export function useHostCommentView({
  effectiveCommentFilter,
  incomingCount,
  peerMode,
  setCommentFilter,
}: Options) {
  const [view, setView] = useState<HostCommentView>(() => {
    if (peerMode) {
      return "open";
    }
    if (incomingCount > 0) {
      return "incoming";
    }
    return effectiveCommentFilter === "resolved" ? "resolved" : "open";
  });

  function openAll() {
    setView("open");
    setCommentFilter("all");
  }

  function selectType(type: CommentType) {
    const shouldReset = view === "open" && effectiveCommentFilter === type;
    setView("open");
    setCommentFilter(shouldReset ? "all" : type);
  }

  function selectView(nextView: HostCommentView) {
    setView(nextView);
    if (nextView === "resolved") {
      setCommentFilter("resolved");
      return;
    }
    if (nextView === "open" && effectiveCommentFilter === "resolved") {
      setCommentFilter("all");
    }
  }

  return { openAll, selectType, selectView, view };
}
