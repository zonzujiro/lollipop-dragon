interface AddressCommentsPromptComment {
  id: string;
  type: string;
  text: string;
}

interface AddressCommentsPromptInput {
  targetPath: string;
  comments: AddressCommentsPromptComment[];
  questionThreadIds?: string[];
}

interface FolderAddressCommentsPromptTarget {
  filePath: string;
  comments: AddressCommentsPromptComment[];
  questionThreadIds?: string[];
}

interface FolderAddressCommentsPromptInput {
  targets: FolderAddressCommentsPromptTarget[];
}

interface PendingPeerCommentPromptComment {
  id: string;
  peerName: string;
  commentType: string;
  text: string;
  blockIndex: number;
  contentPreview: string;
}

interface PendingPeerCommentPromptTarget {
  filePath: string;
  comments: PendingPeerCommentPromptComment[];
}

interface PendingPeerCommentsPromptInput {
  targets: PendingPeerCommentPromptTarget[];
}

function buildQuestionReplyRules(): string {
  return `Question thread replies:
- Leave each original question comment unchanged.
- Read the entire existing thread for each question, including human and agent answers already present.
- Reply with a separate inline CriticMarkup comment near the same text block.
- Use the \`answer:\` prefix in every reply.
- Keep the question's existing \`thread\` value.
- Set \`replyTo\` to the question's \`id\`.
- Give your reply its own unique \`id\`.
- Add your agent name in \`author\` (for example \`Codex\` or \`Cursor\`).
- Keep answers concise, specific, and grounded in the referenced text.`;
}

function buildCommentList(comments: AddressCommentsPromptComment[]): string {
  if (comments.length === 0) {
    return "- None listed.";
  }

  return comments
    .map((comment) => `- ${comment.id} (${comment.type}): ${comment.text}`)
    .join("\n");
}

function buildQuestionThreadList(questionThreadIds: string[]): string {
  if (questionThreadIds.length === 0) {
    return "- Answer any MarkReview question threads you find as needed.";
  }

  return questionThreadIds.map((commentId) => `- ${commentId}`).join("\n");
}

export function buildAgentReplyPrompt(): string {
  return `Review this markdown file and answer MarkReview threaded questions inline.

${buildQuestionReplyRules()}

Example question:
{>>question: Why is this section needed? [markreview id="mr-question-1" thread="mr-question-1"]<<}

Example answer:
{>>answer: This section explains the reconnect fallback path after a missed live event. [markreview id="mr-answer-1" thread="mr-question-1" replyTo="mr-question-1" author="Codex"]<<}`;
}

export function buildAddressCommentsAgentPrompt(
  input: AddressCommentsPromptInput,
): string {
  const commentList = buildCommentList(input.comments);
  const questionThreadList = buildQuestionThreadList(
    input.questionThreadIds ?? [],
  );

  return `Review ${input.targetPath} and update it directly.

Scope:
- Work only in ${input.targetPath}.
- Address these unresolved MarkReview comments:
${commentList}
- Answer these MarkReview question threads as needed:
${questionThreadList}
- Apply the requested edits directly in the markdown.
- Remove each addressed MarkReview comment once its requested change is applied.
- Do not remove question comments when answering them.
- Do not edit unrelated files or unrelated comments.

${buildQuestionReplyRules()}`;
}

export function buildFolderAddressCommentsAgentPrompt(
  input: FolderAddressCommentsPromptInput,
): string {
  const targetList = input.targets
    .map((target) => {
      const commentList = target.comments
        .map(
          (comment) => `  - ${comment.id} (${comment.type}): ${comment.text}`,
        )
        .join("\n");
      const questionThreadList = (target.questionThreadIds ?? [])
        .map((commentId) => `  - ${commentId}`)
        .join("\n");
      const sections = [`- ${target.filePath}`];
      if (commentList) {
        sections.push("  Comments:", commentList);
      }
      if (questionThreadList) {
        sections.push("  Question threads:", questionThreadList);
      }
      if (!commentList && !questionThreadList) {
        sections.push("  - Review this file for any MarkReview threads.");
      }
      return sections.join("\n");
    })
    .join("\n");

  return `Review these markdown files and update them directly.

Scope:
- Work only in the listed markdown files.
- Address the listed unresolved MarkReview comments.
- Answer the listed MarkReview question threads as needed.
${targetList}
- Apply the requested edits directly in the markdown files.
- Remove each addressed MarkReview comment once its requested change is applied.
- Do not remove question comments when answering them.
- Do not edit unrelated files or unrelated comments.

${buildQuestionReplyRules()}`;
}

export function buildPendingPeerCommentsAgentPrompt(
  input: PendingPeerCommentsPromptInput,
): string {
  const targetList = input.targets
    .map((target) => {
      const commentList = target.comments
        .map(
          (comment) =>
            `  - ${comment.id} (${comment.commentType}) from ${comment.peerName} at block ${comment.blockIndex + 1}: ${comment.text}\n    Preview: ${comment.contentPreview}`,
        )
        .join("\n");
      return `- ${target.filePath}\n${commentList}`;
    })
    .join("\n");

  return `Review these pending peer comments and apply the useful changes.

Scope:
- Work only in the listed markdown files.
- Review only these pending peer comment ids:
${targetList}
- Apply accepted changes directly in the markdown.
- Do not add new MarkReview comments unless a peer comment is a question that cannot be answered by editing the text.
- Do not edit unrelated files or unrelated comments.
- Do not dismiss or resolve pending comments in Dragon; the host will do that after reviewing your changes.`;
}
