import "./MermaidBlock.css";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import mermaid from "mermaid";
import { findQuoteOccurrences } from "../../../markup";
import type {
  CommentAnchor,
  CommentAnchorDraft,
  CommentType,
} from "../../../types/criticmarkup";
import { CodeCommentSurface } from "../CodeCommentSurface";

mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });

const DIRECTION_PATTERN = /^((?:graph|flowchart)\s+)(TD|LR|TB|RL|BT)(\b.*)/i;

type Direction = "TD" | "LR";
type MermaidView = "diagram" | "source";
const EMPTY_MERMAID_COMMENTS: MermaidComment[] = [];

export interface MermaidComment {
  id: string;
  type: CommentType;
  anchor?: CommentAnchor;
  authorLabel: string;
}

interface NodePosition {
  label: string;
  left: number;
  top: number;
}

interface MermaidSvgProps {
  svg: string;
}

const MermaidSvg = memo(function MermaidSvg({ svg }: MermaidSvgProps) {
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
});

interface Props {
  activeCommentId?: string | null;
  blockIndex?: number;
  code: string;
  comments?: MermaidComment[];
  onCreateAnchor?: (anchor: CommentAnchorDraft) => void;
  onSelectComment?: (commentId: string) => void;
  onViewChange?: () => void;
}

function ignoreAnchor() {}
function ignoreCommentSelection() {}
function ignoreViewChange() {}

function parseDirection(code: string): Direction | null {
  const match = DIRECTION_PATTERN.exec(code.trimStart());
  if (!match) {
    return null;
  }
  const direction = match[2].toUpperCase();
  if (direction === "TB" || direction === "TD") {
    return "TD";
  }
  if (direction === "LR") {
    return "LR";
  }
  return null;
}

function setDirection(code: string, direction: Direction): string {
  return code.replace(DIRECTION_PATTERN, `$1${direction}$3`);
}

function buildNodeAnchor(
  code: string,
  label: string,
): CommentAnchorDraft | null {
  const quote = label.trim();
  if (!quote) {
    return null;
  }
  const occurrences = findQuoteOccurrences(code, quote);
  const start = occurrences[0];
  if (start === undefined) {
    return null;
  }
  return {
    quote,
    occurrence: 1,
    start,
    end: start + quote.length,
  };
}

function getNodeLabel(node: Element): string {
  return (node.querySelector(".nodeLabel, .label")?.textContent ?? "").trim();
}

function commentMatchesNode(comment: MermaidComment, label: string): boolean {
  return Boolean(
    comment.anchor &&
    !comment.anchor.orphaned &&
    comment.anchor.quote === label,
  );
}

export function MermaidBlock({
  activeCommentId = null,
  blockIndex = 0,
  code,
  comments = EMPTY_MERMAID_COMMENTS,
  onCreateAnchor = ignoreAnchor,
  onSelectComment = ignoreCommentSelection,
  onViewChange = ignoreViewChange,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const diagramRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [directionOverride, setDirectionOverride] = useState<Direction | null>(
    null,
  );
  const [view, setView] = useState<MermaidView>("diagram");
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);

  const originalDirection = parseDirection(code);
  const effectiveCode =
    directionOverride && originalDirection
      ? setDirection(code, directionOverride)
      : code;
  const currentDirection = directionOverride ?? originalDirection;
  const nextDirection: Direction | null =
    currentDirection === "TD" ? "LR" : currentDirection === "LR" ? "TD" : null;

  useEffect(() => {
    setDirectionOverride(null);
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);

    mermaid
      .render(`mermaid-${uid}`, effectiveCode)
      .then(({ svg: result }) => {
        if (!cancelled) {
          setSvg(result);
        }
      })
      .catch((renderError: unknown) => {
        if (!cancelled) {
          setError(
            renderError instanceof Error
              ? renderError.message
              : "Invalid diagram syntax",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveCode, uid]);

  const measureNodes = useCallback(() => {
    const diagram = diagramRef.current;
    if (!diagram) {
      return;
    }
    const diagramBox = diagram.getBoundingClientRect();
    const nextPositions: NodePosition[] = [];
    const nodes = diagram.querySelectorAll<SVGElement>("g.node");
    for (const node of nodes) {
      const label = getNodeLabel(node);
      if (!label) {
        continue;
      }
      const box = node.getBoundingClientRect();
      nextPositions.push({
        label,
        left: box.right - diagramBox.left,
        top: box.top - diagramBox.top,
      });
    }
    setNodePositions(nextPositions);
  }, []);

  useEffect(() => {
    if (view !== "diagram" || !svg) {
      return;
    }
    const diagram = diagramRef.current;
    if (!diagram) {
      return;
    }
    const nodes = diagram.querySelectorAll<SVGElement>("g.node");
    for (const node of nodes) {
      const label = getNodeLabel(node);
      const matchingComments = comments.filter((comment) =>
        commentMatchesNode(comment, label),
      );
      const firstComment = matchingComments[0];
      if (firstComment) {
        node.dataset.commentType = firstComment.type;
        node.dataset.commentSelected = matchingComments.some(
          (comment) => comment.id === activeCommentId,
        )
          ? "true"
          : "false";
      } else {
        delete node.dataset.commentType;
        delete node.dataset.commentSelected;
      }
      node.setAttribute("tabindex", "0");
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", `Comment on Mermaid node ${label}`);
    }
  });

  useEffect(() => {
    if (view !== "diagram" || !svg) {
      return;
    }
    const diagram = diagramRef.current;
    if (!diagram) {
      return;
    }
    const activateNode = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const node = target.closest("g.node");
      if (!node || !diagram.contains(node)) {
        return;
      }
      if (
        event instanceof KeyboardEvent &&
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const anchor = buildNodeAnchor(code, getNodeLabel(node));
      if (anchor) {
        onCreateAnchor(anchor);
      }
    };
    diagram.addEventListener("click", activateNode);
    diagram.addEventListener("keydown", activateNode);
    return () => {
      diagram.removeEventListener("click", activateNode);
      diagram.removeEventListener("keydown", activateNode);
    };
  });

  useEffect(() => {
    if (view !== "diagram" || !svg) {
      setNodePositions([]);
      return;
    }
    const diagram = diagramRef.current;
    if (!diagram) {
      return;
    }
    measureNodes();
    const resizeObserver = new ResizeObserver(measureNodes);
    resizeObserver.observe(diagram);
    return () => {
      resizeObserver.disconnect();
    };
  }, [measureNodes, svg, view]);

  const pins = useMemo(
    () =>
      nodePositions.flatMap((position) =>
        comments
          .filter((comment) => commentMatchesNode(comment, position.label))
          .map((comment, stackIndex) => ({
            comment,
            left: position.left + stackIndex * 11,
            top: position.top - 7,
          })),
      ),
    [comments, nodePositions],
  );

  const selectView = (nextView: MermaidView) => {
    setView(nextView);
    onViewChange();
  };

  const visibleView: MermaidView = error ? "source" : view;

  return (
    <div
      className="mermaid-block"
      data-block-index={blockIndex}
      data-special-view={visibleView}
    >
      <div className="mermaid-block__toolbar" aria-label="Mermaid view">
        <button
          type="button"
          className={view === "diagram" ? "is-active" : ""}
          aria-pressed={view === "diagram"}
          onClick={() => selectView("diagram")}
        >
          diagram
        </button>
        <button
          type="button"
          className={view === "source" ? "is-active" : ""}
          aria-pressed={view === "source"}
          onClick={() => selectView("source")}
        >
          source
        </button>
        {nextDirection && view === "diagram" && (
          <button
            type="button"
            onClick={() => setDirectionOverride(nextDirection)}
            title={`Switch to ${nextDirection} layout`}
            aria-label={`Switch to ${nextDirection} layout`}
          >
            {nextDirection}
          </button>
        )}
      </div>

      {view === "source" || error ? (
        <>
          <CodeCommentSurface
            plainText={code}
            languageClassName="language-mermaid"
            onCreateAnchor={onCreateAnchor}
          >
            {code}
          </CodeCommentSurface>
          {error && <p className="mermaid-error-msg">Mermaid error: {error}</p>}
        </>
      ) : (
        <div className="mermaid-diagram" ref={diagramRef}>
          {svg && <MermaidSvg svg={svg} />}
          {pins.map(({ comment, left, top }) => (
            <button
              key={comment.id}
              type="button"
              className="mermaid-comment-pin"
              data-comment-type={comment.type}
              data-selected={comment.id === activeCommentId}
              style={{ left, top }}
              aria-label={`Select ${comment.type} comment by ${comment.authorLabel}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectComment(comment.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
