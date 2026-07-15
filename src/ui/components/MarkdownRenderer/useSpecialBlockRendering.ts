import { useMemo, useRef, useState } from "react";
import type { Comment, CommentAnchorDraft } from "../../../types/criticmarkup";
import type {
  SpecialBlockContextValue,
  SpecialBlockView,
} from "./specialBlockContext";

export function useSpecialBlockRendering(input: {
  activeCommentId: string | null;
  comments: Comment[];
  onCreateAnchor: (blockIndex: number, anchor: CommentAnchorDraft) => void;
  onSelectComment: (commentId: string) => void;
}) {
  const [revision, setRevision] = useState(0);
  const specialViewsRef = useRef(new Map<number, SpecialBlockView>());
  const contextValue = useMemo<SpecialBlockContextValue>(
    () => ({
      activeCommentId: input.activeCommentId,
      comments: input.comments,
      onCreateAnchor: input.onCreateAnchor,
      onSelectComment: input.onSelectComment,
      onViewChange: (blockIndex, view) => {
        specialViewsRef.current.set(blockIndex, view);
        setRevision((currentRevision) => currentRevision + 1);
      },
      specialViews: specialViewsRef.current,
    }),
    [
      input.activeCommentId,
      input.comments,
      input.onCreateAnchor,
      input.onSelectComment,
    ],
  );

  return { contextValue, revision };
}
