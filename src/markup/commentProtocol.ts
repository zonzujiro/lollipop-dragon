import type {
  Comment,
  CommentThreadMetadata,
  CommentType,
} from "../types/criticmarkup";

const PREFIX_RE = /^(fix|rewrite|expand|clarify|question|answer|remove):\s*/i;
const METADATA_RE = /\s*\[markreview\s+([^\]]+)\]\s*$/i;
const THREAD_COMMENT_PREFIX = "mr-";

const COMMENT_TYPES: ReadonlySet<string> = new Set<CommentType>([
  "note",
  "fix",
  "rewrite",
  "expand",
  "clarify",
  "question",
  "answer",
  "remove",
]);

export function isCommentType(value: string): value is CommentType {
  return COMMENT_TYPES.has(value);
}

export function parseCommentType(text: string): {
  type: CommentType;
  text: string;
} {
  const match = PREFIX_RE.exec(text);
  if (!match) {
    return { type: "note", text };
  }
  const lower = match[1].toLowerCase();
  return {
    type: isCommentType(lower) ? lower : "note",
    text: text.slice(match[0].length),
  };
}

function parseMetadataAttributes(
  attributesText: string,
): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRe =
    /([a-zA-Z][a-zA-Z0-9]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;

  let match: RegExpExecArray | null = attributeRe.exec(attributesText);
  while (match) {
    const [, key, doubleQuoted, singleQuoted, unquoted] = match;
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
    attributes[key] = value;
    match = attributeRe.exec(attributesText);
  }

  return attributes;
}

export function parseThreadMetadata(text: string): {
  text: string;
  thread?: CommentThreadMetadata;
} {
  const metadataMatch = METADATA_RE.exec(text);
  if (!metadataMatch) {
    return { text };
  }

  const attributes = parseMetadataAttributes(metadataMatch[1]);
  const commentId = attributes.id;
  const threadId = attributes.thread;
  if (!commentId || !threadId) {
    return { text };
  }

  const visibleText = text.slice(0, metadataMatch.index).trimEnd();

  const thread: CommentThreadMetadata = {
    commentId,
    threadId,
  };
  if (attributes.replyTo) {
    thread.replyTo = attributes.replyTo;
  }
  if (attributes.author) {
    thread.authorLabel = attributes.author;
  }

  return {
    text: visibleText,
    thread,
  };
}

export function parseStructuredCommentBody(text: string): {
  type: CommentType;
  text: string;
  thread?: CommentThreadMetadata;
} {
  const parsedType = parseCommentType(text);
  const parsedThread = parseThreadMetadata(parsedType.text);
  return {
    type: parsedType.type,
    text: parsedThread.text,
    thread: parsedThread.thread,
  };
}

function serializeThreadMetadata(thread: CommentThreadMetadata): string {
  const attributes = [
    `id="${thread.commentId}"`,
    `thread="${thread.threadId}"`,
  ];

  if (thread.replyTo) {
    attributes.push(`replyTo="${thread.replyTo}"`);
  }
  if (thread.authorLabel) {
    attributes.push(`author="${thread.authorLabel}"`);
  }

  return `[markreview ${attributes.join(" ")}]`;
}

export function serializeCommentBody(input: {
  type: CommentType;
  text: string;
  thread?: CommentThreadMetadata;
}): string {
  const prefix = input.type === "note" ? "" : `${input.type}: `;
  const metadata = input.thread
    ? ` ${serializeThreadMetadata(input.thread)}`
    : "";
  return `${prefix}${input.text}${metadata}`;
}

function createRandomCommentId(): string {
  const cryptoValue = globalThis.crypto;
  if (cryptoValue && typeof cryptoValue.randomUUID === "function") {
    return `${THREAD_COMMENT_PREFIX}${cryptoValue.randomUUID()}`;
  }

  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const timeSuffix = Date.now().toString(36);
  return `${THREAD_COMMENT_PREFIX}${timeSuffix}-${randomSuffix}`;
}

export function createQuestionThreadMetadata(): CommentThreadMetadata {
  const commentId = createRandomCommentId();
  return {
    commentId,
    threadId: commentId,
  };
}

export function createThreadReplyMetadata(input: {
  root: Comment;
  authorLabel: string;
}): CommentThreadMetadata | null {
  const rootThread = input.root.thread;
  if (!rootThread) {
    return null;
  }

  return {
    commentId: createRandomCommentId(),
    threadId: rootThread.threadId,
    replyTo: rootThread.commentId,
    authorLabel: input.authorLabel,
  };
}

export function isThreadReply(comment: Comment): boolean {
  return !!comment.thread?.replyTo;
}

export function isThreadRoot(comment: Comment): boolean {
  return !!comment.thread && !comment.thread.replyTo;
}

export interface CommentThreadGroup {
  root: Comment;
  replies: Comment[];
}

function findThreadRoot(
  comment: Comment,
  commentsByThreadCommentId: Map<string, Comment>,
): Comment | null {
  if (!isThreadReply(comment)) {
    return comment;
  }

  const threadId = comment.thread?.threadId;
  const commentId = comment.thread?.commentId;
  if (!threadId || !commentId) {
    return null;
  }

  const visitedCommentIds = new Set<string>([commentId]);
  let currentComment = comment;

  while (currentComment.thread?.replyTo) {
    const parentCommentId = currentComment.thread.replyTo;
    if (visitedCommentIds.has(parentCommentId)) {
      return null;
    }

    const parentComment = commentsByThreadCommentId.get(parentCommentId);
    if (!parentComment || parentComment.thread?.threadId !== threadId) {
      return null;
    }

    visitedCommentIds.add(parentCommentId);
    currentComment = parentComment;
  }

  return currentComment;
}

export function buildCommentThreadGroups(
  comments: Comment[],
): CommentThreadGroup[] {
  const commentsByThreadCommentId = new Map<string, Comment>();

  for (const comment of comments) {
    if (comment.thread?.commentId) {
      commentsByThreadCommentId.set(comment.thread.commentId, comment);
    }
  }

  const groups: CommentThreadGroup[] = [];
  const groupsByRoot = new Map<Comment, CommentThreadGroup>();
  for (const comment of comments) {
    const rootComment = findThreadRoot(comment, commentsByThreadCommentId);
    if (rootComment && rootComment !== comment) {
      continue;
    }

    const group: CommentThreadGroup = { root: comment, replies: [] };
    groups.push(group);
    groupsByRoot.set(comment, group);
  }

  for (const comment of comments) {
    const rootComment = findThreadRoot(comment, commentsByThreadCommentId);
    if (!rootComment || rootComment === comment) {
      continue;
    }

    groupsByRoot.get(rootComment)?.replies.push(comment);
  }

  return groups;
}

export function getThreadRootCommentId(comment: Comment): string {
  return comment.thread?.replyTo ?? comment.id;
}
