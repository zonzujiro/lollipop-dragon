import {
  assignBlockIndices,
  getBlockPlainTextMap,
  getBlockPositions,
  parseMarkdownFrontmatter,
  parseCriticMarkup,
  resolveCommentAnchor,
  shiftCommentRawOffsets,
} from "../../../markup";
import type { MarkdownMetadataField } from "../../../markup";
import type { Comment } from "../../../types/criticmarkup";
import type { PeerComment } from "../../../types/share";

export interface MarkdownDocumentModel {
  cleanMarkdown: string;
  comments: Comment[];
  metadata: MarkdownMetadataField[];
}

export function parseMarkdownDocument(
  rawContent: string,
): MarkdownDocumentModel {
  const document = parseMarkdownFrontmatter(rawContent);
  const parsed = parseCriticMarkup(document.body);
  const comments = assignBlockIndices(parsed.comments, parsed.cleanMarkdown);

  return {
    cleanMarkdown: parsed.cleanMarkdown,
    comments: shiftCommentRawOffsets(comments, document.bodyStart),
    metadata: document.metadata,
  };
}

export function getCleanMarkdownBlocks(rawContent: string): string[] {
  const document = parseMarkdownFrontmatter(rawContent);
  const cleanMarkdown = parseCriticMarkup(document.body).cleanMarkdown;
  return getBlockPositions(cleanMarkdown).map((block) =>
    cleanMarkdown.slice(block.start, block.end),
  );
}

export function buildPeerRangeComments(input: {
  comments: PeerComment[];
  activeFilePath: string | null;
  cleanMarkdown: string;
}): Comment[] {
  return input.comments.flatMap((peerComment, commentIndex) => {
    if (
      peerComment.path !== input.activeFilePath ||
      !peerComment.blockRef.quote
    ) {
      return [];
    }
    const blockMap = getBlockPlainTextMap(
      input.cleanMarkdown,
      peerComment.blockRef.blockIndex,
    );
    if (!blockMap) {
      return [];
    }
    const anchor = resolveCommentAnchor(blockMap.plainText, {
      quote: peerComment.blockRef.quote,
      occurrence: peerComment.blockRef.occurrence ?? 1,
    });
    return [
      {
        id: peerComment.id,
        criticType: "comment",
        type: peerComment.commentType,
        text: peerComment.text,
        raw: "",
        rawStart: commentIndex,
        rawEnd: commentIndex,
        cleanStart: 0,
        cleanEnd: 0,
        blockIndex: peerComment.blockRef.blockIndex,
        thread: {
          commentId: peerComment.id,
          threadId: peerComment.id,
          authorLabel: peerComment.peerName,
        },
        anchor,
      },
    ];
  });
}

function hashContent(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function getMarkdownContentKey(input: {
  activeFilePath: string | null;
  fileName: string | null;
  cleanMarkdown: string;
}): string {
  const documentIdentity = input.activeFilePath ?? input.fileName ?? "";
  return `${documentIdentity}:${input.cleanMarkdown.length}:${hashContent(input.cleanMarkdown)}`;
}
