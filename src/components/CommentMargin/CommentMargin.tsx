import "./CommentMargin.css";
import { useEffect, useRef, useMemo, useState } from "react";
import { useAppStore } from "../../store";
import { useActiveTab } from "../../store/selectors";
import { CommentCard } from "../CommentCard";
import { peerColor, initials } from "../../utils/peerDisplay";
import { COMMENT_TYPE_COLOR } from "../../types/criticmarkup";
import type { Comment, CommentType } from "../../types/criticmarkup";
import type { PeerComment } from "../../types/share";

const COMMENT_TYPES: CommentType[] = [
  "note",
  "fix",
  "rewrite",
  "expand",
  "clarify",
  "question",
  "remove",
];

interface AddCommentFormProps {
  top: number;
  onSubmit: (type: CommentType, text: string) => void;
  onCancel: () => void;
}

function AddCommentForm({ top, onSubmit, onCancel }: AddCommentFormProps) {
  const [type, setType] = useState<CommentType>("note");
  const [text, setText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!text.trim()) {
      return;
    }
    onSubmit(type, text.trim());
  }

  return (
    <form
      className="comment-add-form"
      style={{ top }}
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="comment-add-form__types">
        {COMMENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`comment-add-form__type${type === t ? " comment-add-form__type--active" : ""}`}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        className="comment-add-form__input"
        placeholder="Add a comment…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
      />
      <div className="comment-add-form__actions">
        <button
          type="submit"
          className="comment-add-form__save"
          disabled={!text.trim()}
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

interface DotGroup {
  top: number;
  comments: Comment[];
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  hoveredBlock: { index: number; top: number } | null;
  onAddComment: (blockIndex: number, type: CommentType, text: string) => void;
  peerMode?: boolean;
  onPostPeerComment?: (
    blockIndex: number,
    type: CommentType,
    text: string,
  ) => void;
}

export function CommentMargin({
  containerRef,
  hoveredBlock,
  onAddComment,
  peerMode,
  onPostPeerComment,
}: Props) {
  const editCommentAction = useAppStore((s) => s.editComment);
  const deleteCommentAction = useAppStore((s) => s.deleteComment);
  const [addingBlock, setAddingBlock] = useState<{
    index: number;
    top: number;
  } | null>(null);
  const tab = useActiveTab();
  const allComments = tab?.comments ?? [];
  const commentFilter = tab?.commentFilter ?? "all";
  const activeId = tab?.activeCommentId ?? null;
  const setActiveId = useAppStore((s) => s.setActiveCommentId);
  const pendingComments = tab?.pendingComments ?? {};
  const activeDocId = tab?.activeDocId ?? null;
  const activeFilePath = tab?.activeFilePath ?? null;
  const fileName = tab?.fileName ?? null;
  const [blockTops, setBlockTops] = useState<Map<number, number>>(new Map());
  // 'resolved' means the comments are gone from the file — no dots to show.
  // 'pending' is the same as 'all' for current (still-in-file) comments.
  const comments =
    commentFilter === "all" ||
    commentFilter === "pending" ||
    commentFilter === "resolved"
      ? commentFilter === "resolved"
        ? []
        : allComments
      : allComments.filter((c) => c.type === commentFilter);
  const [groups, setGroups] = useState<DotGroup[]>([]);
  const measureRef = useRef<() => void>(() => {});

  // In peer mode, show the peer's own comments as dots
  const myPeerComments = useAppStore((s) => s.myPeerComments);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);

  // Peer comments for the current file, grouped by blockIndex
  const peerDotGroups = useMemo(() => {
    if (peerMode) {
      // Peer sees their own comments
      const currentPath = peerActiveFilePath ?? "";
      const forFile = currentPath
        ? myPeerComments.filter((c) => c.path === currentPath)
        : myPeerComments;
      const byBlock = new Map<number, PeerComment[]>();
      for (const c of forFile) {
        const idx = c.blockRef.blockIndex;
        const arr = byBlock.get(idx) ?? [];
        arr.push(c);
        byBlock.set(idx, arr);
      }
      return byBlock;
    }
    // Host sees pending peer comments
    if (!activeDocId) {
      return new Map<number, PeerComment[]>();
    }
    const all = pendingComments[activeDocId] ?? [];
    const currentPath = activeFilePath ?? fileName ?? "";
    const forFile = currentPath
      ? all.filter((c) => c.path === currentPath)
      : all;
    const byBlock = new Map<number, PeerComment[]>();
    for (const c of forFile) {
      const idx = c.blockRef.blockIndex;
      const arr = byBlock.get(idx) ?? [];
      arr.push(c);
      byBlock.set(idx, arr);
    }
    return byBlock;
  }, [
    peerMode,
    myPeerComments,
    peerActiveFilePath,
    pendingComments,
    activeDocId,
    activeFilePath,
    fileName,
  ]);

  // Close card when clicking outside
  useEffect(() => {
    const onDocClick = () => setActiveId(null);
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [setActiveId]);

  useEffect(() => {
    measureRef.current = () => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const byBlock = new Map<number, Comment[]>();
      for (const c of comments) {
        if (c.blockIndex === undefined) {
          continue;
        }
        const arr = byBlock.get(c.blockIndex) ?? [];
        arr.push(c);
        byBlock.set(c.blockIndex, arr);
      }

      const next: DotGroup[] = [];
      const tops = new Map<number, number>();
      const blocks =
        container.querySelectorAll<HTMLElement>("[data-block-index]");
      for (const el of blocks) {
        const idx = Number(el.getAttribute("data-block-index"));
        tops.set(idx, el.offsetTop);
        const group = byBlock.get(idx);
        if (!group) {
          continue;
        }
        next.push({ top: el.offsetTop, comments: group });
      }
      setGroups(next);
      setBlockTops(tops);
    };

    measureRef.current();

    const container = containerRef.current;
    if (!container) {
      return;
    }
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(container);
    return () => ro.disconnect();
  }, [comments, containerRef]);

  return (
    <div className="comment-margin">
      {hoveredBlock && !addingBlock && (
        <div
          className="comment-margin__add-wrapper"
          style={{ top: hoveredBlock.top }}
        >
          <button
            className="comment-margin__add"
            aria-label="Add comment"
            onClick={(e) => {
              e.stopPropagation();
              setAddingBlock(hoveredBlock);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      )}
      {addingBlock && (
        <AddCommentForm
          top={addingBlock.top}
          onSubmit={(type, text) => {
            if (peerMode && onPostPeerComment) {
              onPostPeerComment(addingBlock.index, type, text);
            } else {
              onAddComment(addingBlock.index, type, text);
            }
            setAddingBlock(null);
          }}
          onCancel={() => setAddingBlock(null)}
        />
      )}
      {groups.map(({ top, comments: groupComments }, i) => {
        const activeComment =
          groupComments.find((c) => c.id === activeId) ?? null;
        // Find peer comments for the same block
        const blockIdx = groupComments[0]?.blockIndex;
        const peerForBlock =
          blockIdx !== undefined ? (peerDotGroups.get(blockIdx) ?? []) : [];
        return (
          <div key={i}>
            <div className="comment-margin__dots" style={{ top }}>
              {groupComments.map((c) => (
                <button
                  key={c.id}
                  className={`comment-margin__dot${activeId === c.id ? " comment-margin__dot--active" : ""}`}
                  style={{ backgroundColor: COMMENT_TYPE_COLOR[c.type] }}
                  aria-label={`${c.type}: ${c.text}`}
                  title={`${c.type}: ${c.text}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveId(activeId === c.id ? null : c.id);
                  }}
                />
              ))}
              {peerForBlock.map((pc) => (
                <button
                  key={pc.id}
                  className="comment-margin__peer-dot"
                  style={{ backgroundColor: peerColor(pc.peerName) }}
                  title={`${pc.peerName}: ${pc.text}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    document
                      .querySelector(
                        `[data-block-index="${pc.blockRef.blockIndex}"]`,
                      )
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {initials(pc.peerName)[0]}
                </button>
              ))}
            </div>
            {activeComment && (
              <CommentCard
                comment={activeComment}
                top={top}
                onClose={() => setActiveId(null)}
                onEdit={(type, text) =>
                  editCommentAction(activeComment.id, type, text)
                }
                onDelete={() => {
                  deleteCommentAction(activeComment.id);
                  setActiveId(null);
                }}
              />
            )}
          </div>
        );
      })}
      {/* Peer-only blocks (no host comments at this block) */}
      {Array.from(peerDotGroups.entries()).map(([blockIdx, peerComments]) => {
        // Skip blocks already rendered with host groups
        if (groups.some((g) => g.comments[0]?.blockIndex === blockIdx)) {
          return null;
        }
        const top = blockTops.get(blockIdx);
        if (top == null) {
          return null;
        }
        return (
          <div key={`peer-${blockIdx}`}>
            <div className="comment-margin__dots" style={{ top }}>
              {peerComments.map((pc) => (
                <button
                  key={pc.id}
                  className="comment-margin__peer-dot"
                  style={{ backgroundColor: peerColor(pc.peerName) }}
                  title={`${pc.peerName}: ${pc.text}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    document
                      .querySelector(
                        `[data-block-index="${pc.blockRef.blockIndex}"]`,
                      )
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {initials(pc.peerName)[0]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
