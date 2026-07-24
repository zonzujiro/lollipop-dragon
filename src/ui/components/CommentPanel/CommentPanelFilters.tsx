import type { CommentType } from "../../../types/criticmarkup";

export type HostCommentView = "open" | "incoming" | "resolved";

interface Props {
  activeTypes: CommentType[];
  counts: Partial<Record<CommentType, number>>;
  effectiveCommentFilter: CommentType | "all" | "resolved";
  incomingCount: number;
  openCount: number;
  resolvedCount: number;
  view: HostCommentView;
  onOpenAll: () => void;
  onSelectType: (type: CommentType) => void;
  onSelectView: (view: HostCommentView) => void;
}

export function CommentPanelFilters({
  activeTypes,
  counts,
  effectiveCommentFilter,
  incomingCount,
  openCount,
  resolvedCount,
  view,
  onOpenAll,
  onSelectType,
  onSelectView,
}: Props) {
  const hasStatusViews = incomingCount > 0 || resolvedCount > 0;
  if (activeTypes.length === 0 && !hasStatusViews) {
    return null;
  }

  return (
    <div className="comment-panel__filter-groups">
      <div className="comment-panel__filters">
        <button
          className={`comment-panel__filter${view === "open" && effectiveCommentFilter === "all" ? " comment-panel__filter--active" : ""}`}
          onClick={onOpenAll}
        >
          All <span className="comment-panel__filter-count">{openCount}</span>
        </button>
        {incomingCount > 0 && (
          <button
            className={`comment-panel__filter comment-panel__filter--incoming${view === "incoming" ? " comment-panel__filter--active" : ""}`}
            onClick={() => onSelectView("incoming")}
          >
            <span className="comment-panel__filter-swatch" />
            Incoming{" "}
            <span className="comment-panel__filter-count">{incomingCount}</span>
          </button>
        )}
        {resolvedCount > 0 && (
          <button
            className={`comment-panel__filter${view === "resolved" ? " comment-panel__filter--active" : ""}`}
            onClick={() => onSelectView("resolved")}
          >
            Resolved{" "}
            <span className="comment-panel__filter-count">{resolvedCount}</span>
          </button>
        )}
        {!hasStatusViews &&
          activeTypes.map((type) => (
            <button
              key={type}
              className={`comment-panel__filter${view === "open" && effectiveCommentFilter === type ? " comment-panel__filter--active" : ""}`}
              data-comment-type={type}
              onClick={() => onSelectType(type)}
            >
              <span className="comment-panel__filter-swatch" />
              {type}{" "}
              <span className="comment-panel__filter-count">
                {counts[type]}
              </span>
            </button>
          ))}
      </div>

      {activeTypes.length > 0 && hasStatusViews && (
        <div
          className="comment-panel__filters comment-panel__filters--types"
          aria-label="Open comment types"
        >
          {activeTypes.map((type) => (
            <button
              key={type}
              className={`comment-panel__filter${view === "open" && effectiveCommentFilter === type ? " comment-panel__filter--active" : ""}`}
              data-comment-type={type}
              onClick={() => onSelectType(type)}
            >
              <span className="comment-panel__filter-swatch" />
              {type}{" "}
              <span className="comment-panel__filter-count">
                {counts[type]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
