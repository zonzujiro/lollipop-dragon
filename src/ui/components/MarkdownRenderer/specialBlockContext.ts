import { createContext } from "react";
import type { Comment, CommentAnchorDraft } from "../../../types/criticmarkup";

export type SpecialBlockView = "diagram" | "source";

export interface SpecialBlockContextValue {
  activeCommentId: string | null;
  comments: Comment[];
  onCreateAnchor: (blockIndex: number, anchor: CommentAnchorDraft) => void;
  onSelectComment: (commentId: string) => void;
  onViewChange: (blockIndex: number, view: SpecialBlockView) => void;
  specialViews: Map<number, SpecialBlockView>;
}

export const SpecialBlockContext =
  createContext<SpecialBlockContextValue | null>(null);
