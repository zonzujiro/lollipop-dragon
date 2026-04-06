import type { Comment } from "../../types/criticmarkup";
import type { HostReviewTabState } from "./types";

export function selectVisibleHostComments(
  tab: Pick<HostReviewTabState, "comments" | "resolvedComments" | "commentFilter">,
): Comment[] {
  if (tab.commentFilter === "resolved") {
    return tab.resolvedComments;
  }

  if (tab.commentFilter === "all" || tab.commentFilter === "pending") {
    return tab.comments;
  }

  return tab.comments.filter((comment) => comment.type === tab.commentFilter);
}

export function selectActiveHostComment(
  tab: Pick<HostReviewTabState, "comments" | "resolvedComments" | "activeCommentId">,
): Comment | null {
  if (!tab.activeCommentId) {
    return null;
  }

  return (
    tab.comments.find((comment) => comment.id === tab.activeCommentId) ??
    tab.resolvedComments.find((comment) => comment.id === tab.activeCommentId) ??
    null
  );
}
