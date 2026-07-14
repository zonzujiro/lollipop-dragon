import "./CodeCommentSurface.css";
import type { ReactNode } from "react";
import { findQuoteOccurrences } from "../../../markup";
import type { CommentAnchorDraft } from "../../../types/criticmarkup";

interface Props {
  children: ReactNode;
  plainText: string;
  onCreateAnchor: (anchor: CommentAnchorDraft) => void;
  languageClassName?: string;
}

function buildLineAnchor(
  plainText: string,
  lineIndex: number,
): CommentAnchorDraft | null {
  const lines = plainText.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) {
    return null;
  }
  const quote = line.trim();
  if (!quote) {
    return null;
  }
  let lineStart = 0;
  for (
    let precedingIndex = 0;
    precedingIndex < lineIndex;
    precedingIndex += 1
  ) {
    lineStart += (lines[precedingIndex]?.length ?? 0) + 1;
  }
  const start = lineStart + line.indexOf(quote);
  const occurrences = findQuoteOccurrences(plainText, quote);
  const occurrence = Math.max(occurrences.indexOf(start) + 1, 1);
  return {
    quote,
    occurrence,
    start,
    end: start + quote.length,
  };
}

export function CodeCommentSurface({
  children,
  plainText,
  onCreateAnchor,
  languageClassName,
}: Props) {
  const lines = plainText.split("\n");

  return (
    <div className="code-comment-surface">
      <div className="code-comment-surface__gutter" aria-label="Code lines">
        {lines.map((line, lineIndex) => (
          <button
            key={`${lineIndex}:${line.length}`}
            type="button"
            className="code-comment-surface__line"
            aria-label={`Comment on line ${lineIndex + 1}`}
            disabled={!line.trim()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const anchor = buildLineAnchor(plainText, lineIndex);
              if (anchor) {
                onCreateAnchor(anchor);
              }
            }}
          />
        ))}
      </div>
      <pre className="code-comment-surface__pre">
        <code className={languageClassName} data-anchor-root="true">
          {children}
        </code>
      </pre>
    </div>
  );
}
