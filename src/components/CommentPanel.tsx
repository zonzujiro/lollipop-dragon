import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store";
import { useActiveTab } from "../store/selectors";
import type { Comment, CommentType } from "../types/criticmarkup";

const TYPE_COLOR: Record<CommentType, string> = {
  fix: "var(--c-red)",
  rewrite: "var(--c-orange)",
  expand: "var(--accent)",
  clarify: "var(--c-purple)",
  question: "var(--c-cyan)",
  remove: "var(--text-muted)",
  note: "var(--c-green)",
};

const ALL_TYPES: CommentType[] = [
  "fix",
  "rewrite",
  "expand",
  "clarify",
  "question",
  "remove",
  "note",
];
const COMMENT_TYPES: CommentType[] = [
  "note",
  "fix",
  "rewrite",
  "expand",
  "clarify",
  "question",
  "remove",
];
const EDITABLE_CRITIC_TYPES: Comment["criticType"][] = ["comment", "highlight"];

function scrollToBlock(blockIndex: number | undefined) {
  if (blockIndex === undefined) return;
  document
    .querySelector(`[data-block-index="${blockIndex}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

interface DisplayComment {
  id: string;
  type: CommentType;
  text: string;
  blockIndex: number | undefined;
}

interface Props {
  peerMode?: boolean;
}

export function CommentPanel({ peerMode = false }: Props) {
  const tab = useActiveTab();
  const comments = tab?.comments ?? [];
  const resolvedComments = tab?.resolvedComments ?? [];
  const activeCommentId = tab?.activeCommentId ?? null;
  const commentFilter = tab?.commentFilter ?? "all";
  const setActiveCommentId = useAppStore((s) => s.setActiveCommentId);
  const setCommentFilter = useAppStore((s) => s.setCommentFilter);
  const toggleCommentPanel = useAppStore((s) => s.toggleCommentPanel);
  const myPeerComments = useAppStore((s) => s.myPeerComments);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);
  const activeFilePath = peerMode ? peerActiveFilePath : (tab?.activeFilePath ?? null);
  const fileTree = tab?.fileTree ?? [];
  const allFileComments = tab?.allFileComments ?? {};
  const navigateToComment = useAppStore((s) => s.navigateToComment);
  const editComment = useAppStore((s) => s.editComment);
  const deleteComment = useAppStore((s) => s.deleteComment);
  const editPeerComment = useAppStore((s) => s.editPeerComment);
  const deletePeerComment = useAppStore((s) => s.deletePeerComment);
  const selectPeerFile = useAppStore((s) => s.selectPeerFile);
  const sharedContent = useAppStore((s) => s.sharedContent);

  const isFolderMode = fileTree.length > 0 && !peerMode;
  const isPeerMultiFile =
    peerMode && !!sharedContent && Object.keys(sharedContent.tree).length > 1;

  // In peer mode, map PeerComment[] to a unified display shape
  const peerDisplayComments: DisplayComment[] = useMemo(() => {
    if (!peerMode) return [];
    // In multi-file mode show all; in single-file mode filter to active file
    const filtered = isPeerMultiFile
      ? myPeerComments
      : myPeerComments.filter((c) => c.path === activeFilePath);
    return filtered.map((c) => ({
      id: c.id,
      type: c.commentType,
      text: c.text,
      blockIndex: c.blockRef.blockIndex,
    }));
  }, [peerMode, isPeerMultiFile, myPeerComments, activeFilePath]);

  const sourceComments = peerMode ? peerDisplayComments : comments;

  // Build peer cross-file entries grouped by path
  const peerCrossFileEntries = useMemo(() => {
    if (!isPeerMultiFile) return [];
    const byPath: Record<string, DisplayComment[]> = {};
    for (const c of myPeerComments) {
      if (!byPath[c.path]) byPath[c.path] = [];
      byPath[c.path].push({
        id: c.id,
        type: c.commentType,
        text: c.text,
        blockIndex: c.blockRef.blockIndex,
      });
    }
    return Object.entries(byPath)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, cmts]) => ({
        filePath: path,
        fileName: path.split("/").pop() ?? path,
        comments: cmts,
      }));
  }, [isPeerMultiFile, myPeerComments]);

  // Build cross-file flat list for folder mode (only files with comments)
  const crossFileComments = useMemo(() => {
    if (!isFolderMode) return [];
    const entries = Object.values(allFileComments).filter(
      (e) => e.comments.length > 0,
    );
    entries.sort((a, b) => a.filePath.localeCompare(b.filePath));
    return entries;
  }, [isFolderMode, allFileComments]);

  // Total count across all files for folder/peer-multi-file mode
  const totalCrossFileCount = useMemo(() => {
    if (isPeerMultiFile) return myPeerComments.length;
    if (!isFolderMode) return 0;
    return crossFileComments.reduce((sum, e) => sum + e.comments.length, 0);
  }, [isPeerMultiFile, myPeerComments.length, isFolderMode, crossFileComments]);

  const isResolved = !peerMode && commentFilter === "resolved";

  // All comments flat for counting types in folder/peer-multi-file mode
  const allCommentsFlat = useMemo(() => {
    if (isPeerMultiFile) return peerDisplayComments;
    if (!isFolderMode) return sourceComments;
    return crossFileComments.flatMap((e) => e.comments);
  }, [isPeerMultiFile, peerDisplayComments, isFolderMode, crossFileComments, sourceComments]);

  // Count per type
  const counts = useMemo(() => {
    const c: Partial<Record<CommentType, number>> = {};
    for (const comment of allCommentsFlat) {
      c[comment.type] = (c[comment.type] ?? 0) + 1;
    }
    return c;
  }, [allCommentsFlat]);

  const activeTypes = ALL_TYPES.filter((t) => (counts[t] ?? 0) > 0);

  // For single-file mode: visible list
  const visible = isResolved
    ? resolvedComments
    : commentFilter === "all" || commentFilter === "pending"
      ? sourceComments
      : sourceComments.filter((c) => c.type === commentFilter);

  // For folder mode: filter cross-file entries
  const filteredCrossFile = useMemo(() => {
    if (!isFolderMode || isResolved) return crossFileComments;
    if (commentFilter === "all" || commentFilter === "pending")
      return crossFileComments;
    return crossFileComments
      .map((entry) => ({
        ...entry,
        comments: entry.comments.filter((c) => c.type === commentFilter),
      }))
      .filter((entry) => entry.comments.length > 0);
  }, [isFolderMode, isResolved, crossFileComments, commentFilter]);

  // For peer multi-file mode: filter peer cross-file entries
  const filteredPeerCrossFile = useMemo(() => {
    if (!isPeerMultiFile) return peerCrossFileEntries;
    if (commentFilter === "all" || commentFilter === "pending")
      return peerCrossFileEntries;
    return peerCrossFileEntries
      .map((entry) => ({
        ...entry,
        comments: entry.comments.filter((c) => c.type === commentFilter),
      }))
      .filter((entry) => entry.comments.length > 0);
  }, [isPeerMultiFile, peerCrossFileEntries, commentFilter]);

  function handleEntryClick(id: string, blockIndex: number | undefined) {
    setActiveCommentId(activeCommentId === id ? null : id);
    scrollToBlock(blockIndex);
  }

  function handleCrossFileClick(filePath: string, rawStart: number) {
    navigateToComment(filePath, rawStart);
  }

  function entryLabel(c: DisplayComment): string {
    const body = c.text || "";
    return body.length > 72 ? body.slice(0, 72) + "…" : body;
  }

  function hostEntryLabel(c: (typeof comments)[number]): string {
    const body = c.text || c.highlightedText || c.from || "";
    return body.length > 72 ? body.slice(0, 72) + "…" : body;
  }

  useEffect(() => {
    if (!activeCommentId) return;
    const el = document.querySelector(
      `.comment-panel [data-comment-id="${activeCommentId}"]`,
    );
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeCommentId]);

  const displayCount = isPeerMultiFile || isFolderMode
    ? totalCrossFileCount
    : sourceComments.length;
  const showTypeFilters = !isResolved && activeTypes.length > 1;
  const showStatusFilters = !peerMode && resolvedComments.length > 0;

  return (
    <aside className="comment-panel" aria-label="Comments">
      <div className="comment-panel__header">
        <span className="comment-panel__title">
          Comments
          {displayCount > 0 && (
            <span className="comment-panel__count">{displayCount}</span>
          )}
        </span>
        <button
          className="comment-panel__close"
          onClick={toggleCommentPanel}
          aria-label="Close comments panel"
        >
          ×
        </button>
      </div>

      {(showStatusFilters || showTypeFilters) && (
        <div className="comment-panel__filters">
          {showStatusFilters && (
            <>
              <button
                className={`comment-panel__filter${commentFilter === "all" || commentFilter === "pending" ? " comment-panel__filter--active" : ""}`}
                onClick={() => setCommentFilter("all")}
              >
                Pending{" "}
                <span className="comment-panel__filter-count">
                  {displayCount}
                </span>
              </button>
              <button
                className={`comment-panel__filter${isResolved ? " comment-panel__filter--active" : ""}`}
                onClick={() =>
                  setCommentFilter(isResolved ? "all" : "resolved")
                }
              >
                Resolved{" "}
                <span className="comment-panel__filter-count">
                  {resolvedComments.length}
                </span>
              </button>
              {showTypeFilters && (
                <div className="comment-panel__filter-sep" aria-hidden="true" />
              )}
            </>
          )}
          {showTypeFilters && (
            <>
              {!showStatusFilters && (
                <button
                  className={`comment-panel__filter${commentFilter === "all" || commentFilter === "pending" ? " comment-panel__filter--active" : ""}`}
                  onClick={() => setCommentFilter("all")}
                >
                  All{" "}
                  <span className="comment-panel__filter-count">
                    {displayCount}
                  </span>
                </button>
              )}
              {activeTypes.map((type) => (
                <button
                  key={type}
                  className={`comment-panel__filter${commentFilter === type ? " comment-panel__filter--active" : ""}`}
                  style={
                    commentFilter === type
                      ? {
                          borderColor: TYPE_COLOR[type],
                          color: TYPE_COLOR[type],
                        }
                      : {}
                  }
                  onClick={() =>
                    setCommentFilter(commentFilter === type ? "all" : type)
                  }
                >
                  {type}{" "}
                  <span className="comment-panel__filter-count">
                    {counts[type]}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <div className="comment-panel__list">
        {isPeerMultiFile ? (
          <CrossFileList
            entries={filteredPeerCrossFile}
            activeFilePath={activeFilePath}
            activeCommentId={activeCommentId}
            onEntryClick={handleEntryClick}
            onCrossFileClick={(filePath) => selectPeerFile(filePath)}
            onEdit={editPeerComment}
            onDelete={deletePeerComment}
          />
        ) : isFolderMode ? (
          <CrossFileList
            entries={filteredCrossFile}
            activeFilePath={activeFilePath}
            activeCommentId={activeCommentId}
            onEntryClick={handleEntryClick}
            onCrossFileClick={handleCrossFileClick}
            onEdit={editComment}
            onDelete={deleteComment}
          />
        ) : (
          <SingleFileList
            visible={visible}
            isResolved={isResolved}
            peerMode={peerMode}
            activeCommentId={activeCommentId}
            sourceComments={sourceComments}
            comments={comments}
            onEntryClick={handleEntryClick}
            entryLabel={entryLabel}
            hostEntryLabel={hostEntryLabel}
            onEdit={peerMode ? editPeerComment : editComment}
            onDelete={peerMode ? deletePeerComment : deleteComment}
          />
        )}
      </div>
    </aside>
  );
}

// ── Inline edit/delete state per entry ─────────────────────────────

function InlineEditForm({
  comment,
  onSave,
  onCancel,
}: {
  comment: { type: CommentType; text: string };
  onSave: (type: CommentType, text: string) => void;
  onCancel: () => void;
}) {
  const [editType, setEditType] = useState<CommentType>(comment.type);
  const [editText, setEditText] = useState(comment.text);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!editText.trim()) return;
    onSave(editType, editText.trim());
  }

  return (
    <form
      className="comment-panel__inline-edit"
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="comment-add-form__types">
        {COMMENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`comment-add-form__type${editType === t ? " comment-add-form__type--active" : ""}`}
            onClick={() => setEditType(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        className="comment-add-form__input"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        rows={2}
        autoFocus
      />
      <div className="comment-add-form__actions">
        <button
          type="submit"
          className="comment-add-form__save"
          disabled={!editText.trim()}
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

function InlineDeleteConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="comment-panel__inline-confirm"
      onClick={(e) => e.stopPropagation()}
    >
      <span>Delete this comment?</span>
      <div className="comment-add-form__actions">
        <button className="comment-card__confirm-yes" onClick={onConfirm}>
          Delete
        </button>
        <button className="comment-add-form__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Entry with actions ─────────────────────────────────────────────

function CommentEntry({
  comment,
  isActive,
  isOtherFile,
  canEdit,
  onClick,
  onEdit,
  onDelete,
}: {
  comment: Comment | DisplayComment;
  isActive: boolean;
  isOtherFile: boolean;
  canEdit: boolean;
  onClick: () => void;
  onEdit?: (id: string, type: CommentType, text: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const full = comment as Comment;
  const label = comment.text || full.highlightedText || full.from || "";
  const displayText = label.length > 72 ? label.slice(0, 72) + "…" : label;
  const isEditable =
    canEdit &&
    (!full.criticType || EDITABLE_CRITIC_TYPES.includes(full.criticType));

  if (editing) {
    return (
      <div className="comment-panel__entry comment-panel__entry--editing">
        <InlineEditForm
          comment={comment}
          onSave={(type, text) => {
            onEdit?.(comment.id, type, text);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="comment-panel__entry comment-panel__entry--editing">
        <InlineDeleteConfirm
          onConfirm={() => {
            onDelete?.(comment.id);
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      </div>
    );
  }

  return (
    <div
      data-comment-id={comment.id}
      role="button"
      tabIndex={0}
      className={`comment-panel__entry${isActive ? " comment-panel__entry--active" : ""}${isOtherFile ? " comment-panel__entry--other-file" : ""}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <span
        className="comment-panel__badge"
        style={{ backgroundColor: TYPE_COLOR[comment.type], color: "#fff" }}
      >
        {comment.type}
      </span>
      {comment.blockIndex !== undefined && (
        <span className="comment-panel__ref">¶{comment.blockIndex + 1}</span>
      )}
      {canEdit && (
        <span
          className="comment-panel__entry-actions"
          onClick={(e) => e.stopPropagation()}
        >
          {isEditable && (
            <button
              className="comment-panel__entry-edit"
              onClick={() => setEditing(true)}
              aria-label="Edit comment"
            >
              Edit
            </button>
          )}
          <button
            className="comment-panel__entry-delete"
            onClick={() => setConfirming(true)}
            aria-label="Delete comment"
          >
            Del
          </button>
        </span>
      )}
      <span className="comment-panel__text">{displayText}</span>
    </div>
  );
}

// ── Cross-file list ────────────────────────────────────────────────

function CrossFileList({
  entries,
  activeFilePath,
  activeCommentId,
  onEntryClick,
  onCrossFileClick,
  onEdit,
  onDelete,
}: {
  entries: { filePath: string; fileName: string; comments: (Comment | DisplayComment)[] }[];
  activeFilePath: string | null;
  activeCommentId: string | null;
  onEntryClick: (id: string, blockIndex: number | undefined) => void;
  onCrossFileClick: (filePath: string, rawStart: number) => void;
  onEdit: (id: string, type: CommentType, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const totalCount = entries.reduce((sum, e) => sum + e.comments.length, 0);

  if (totalCount === 0) {
    return <p className="comment-panel__empty">No comments across files.</p>;
  }

  return (
    <>
      {entries.map((entry) => {
        const isActiveFile = entry.filePath === activeFilePath;
        return (
          <div key={entry.filePath}>
            <div className="comment-panel__file-header">
              <span className="comment-panel__file-name">{entry.fileName}</span>
              <span className="comment-panel__file-count">
                {entry.comments.length}
              </span>
            </div>
            {entry.comments.map((c) => {
              const rawStart = "rawStart" in c ? c.rawStart : 0;
              return (
                <CommentEntry
                  key={`${entry.filePath}:${c.id}`}
                  comment={c}
                  isActive={isActiveFile && activeCommentId === c.id}
                  isOtherFile={!isActiveFile}
                  canEdit={true}
                  onClick={() => {
                    if (isActiveFile) {
                      onEntryClick(c.id, c.blockIndex);
                    } else {
                      onCrossFileClick(entry.filePath, rawStart);
                    }
                  }}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// ── Single-file list ───────────────────────────────────────────────

function SingleFileList({
  visible,
  isResolved,
  peerMode,
  activeCommentId,
  sourceComments,
  comments,
  onEntryClick,
  entryLabel,
  hostEntryLabel,
  onEdit,
  onDelete,
}: {
  visible: (Comment | DisplayComment)[];
  isResolved: boolean;
  peerMode: boolean;
  activeCommentId: string | null;
  sourceComments: (Comment | DisplayComment)[];
  comments: Comment[];
  onEntryClick: (id: string, blockIndex: number | undefined) => void;
  entryLabel: (c: DisplayComment) => string;
  hostEntryLabel: (c: Comment) => string;
  onEdit: (id: string, type: CommentType, text: string) => void;
  onDelete: (id: string) => void;
}) {
  if (visible.length === 0) {
    return (
      <p className="comment-panel__empty">
        {isResolved
          ? "No resolved comments."
          : sourceComments.length === 0
            ? peerMode
              ? "No comments yet."
              : "No comments in this document."
            : "No comments match the filter."}
      </p>
    );
  }

  return (
    <>
      {visible.map((c) =>
        isResolved ? (
          <div
            key={c.id}
            className="comment-panel__entry comment-panel__entry--resolved"
          >
            <span
              className="comment-panel__badge"
              style={{
                backgroundColor: TYPE_COLOR[c.type],
                color: "#fff",
                opacity: 0.6,
              }}
            >
              {c.type}
            </span>
            {c.blockIndex !== undefined && (
              <span className="comment-panel__ref">¶{c.blockIndex + 1}</span>
            )}
            <span className="comment-panel__text comment-panel__text--resolved">
              {peerMode ? entryLabel(c) : hostEntryLabel(c as Comment)}
            </span>
          </div>
        ) : (
          <CommentEntry
            key={c.id}
            comment={c}
            isActive={activeCommentId === c.id}
            isOtherFile={false}
            canEdit={true}
            onClick={() => onEntryClick(c.id, c.blockIndex)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ),
      )}
    </>
  );
}
