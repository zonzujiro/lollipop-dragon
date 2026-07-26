import type { Blockquote, Paragraph, Root, RootContent, Text } from "mdast";

export type MarkdownAlertType =
  | "note"
  | "tip"
  | "important"
  | "warning"
  | "caution";

interface MarkdownAlertMatch {
  blockquote: Blockquote;
  firstParagraph: Paragraph;
  firstText: Text;
  label: string;
  markerLength: number;
  type: MarkdownAlertType;
}

const ALERT_TYPE_BY_MARKER: Record<string, MarkdownAlertType> = {
  NOTE: "note",
  TIP: "tip",
  IMPORTANT: "important",
  WARNING: "warning",
  CAUTION: "caution",
};

const ALERT_LABEL_BY_TYPE: Record<MarkdownAlertType, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

const ALERT_MARKER_PATTERN =
  /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\n|$)/;

export function findMarkdownAlert(
  node: RootContent,
): MarkdownAlertMatch | null {
  if (node.type !== "blockquote") {
    return null;
  }
  const firstParagraph = node.children[0];
  if (!firstParagraph || firstParagraph.type !== "paragraph") {
    return null;
  }
  const firstText = firstParagraph.children[0];
  if (!firstText || firstText.type !== "text") {
    return null;
  }
  const markerMatch = ALERT_MARKER_PATTERN.exec(firstText.value);
  if (!markerMatch) {
    return null;
  }
  const marker = markerMatch[0];
  if (!marker.endsWith("\n") && firstParagraph.children.length > 1) {
    return null;
  }
  const type = ALERT_TYPE_BY_MARKER[markerMatch[1]];
  if (!type) {
    return null;
  }
  return {
    blockquote: node,
    firstParagraph,
    firstText,
    label: ALERT_LABEL_BY_TYPE[type],
    markerLength: marker.length,
    type,
  };
}

function removeAlertMarker(alert: MarkdownAlertMatch): void {
  const remainingText = alert.firstText.value.slice(alert.markerLength);
  if (remainingText) {
    alert.firstText.value = remainingText;
    return;
  }
  if (alert.firstParagraph.children.length === 1) {
    alert.blockquote.children.shift();
  }
}

export function remarkMarkdownAlerts() {
  return (tree: Root): void => {
    for (const node of tree.children) {
      const alert = findMarkdownAlert(node);
      if (!alert) {
        continue;
      }
      node.data = {
        ...node.data,
        hProperties: {
          "aria-label": `${alert.label} alert`,
          "data-alert-label": alert.label,
          "data-markdown-alert": alert.type,
          role: "note",
        },
      };
      removeAlertMarker(alert);
    }
  };
}
