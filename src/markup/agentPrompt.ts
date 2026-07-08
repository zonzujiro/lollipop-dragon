interface AddressCommentsPromptInput {
  targetPath: string;
}

interface FolderAddressCommentsPromptTarget {
  filePath: string;
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
- If a thread contains user-authored threaded action comments (\`fix:\`, \`rewrite:\`, \`expand:\`, \`clarify:\`, or \`remove:\` with \`replyTo\` metadata), treat those as document-change instructions instead of questions to answer.
- Reply with a separate inline CriticMarkup comment near the same text block.
- Use the \`answer:\` prefix in every reply.
- Keep the question's existing \`thread\` value.
- Set \`replyTo\` to the \`id\` of the question or follow-up message you are answering.
- Give your reply its own unique \`id\`.
- Add your agent name in \`author\` (for example \`Codex\` or \`Cursor\`).
- Keep answers concise, specific, and grounded in the referenced text.`;
}

function buildThreadActionRules(): string {
  return `Thread action replies:
- A user-authored threaded action comment is a MarkReview comment with \`replyTo\` metadata and type \`fix:\`, \`rewrite:\`, \`expand:\`, \`clarify:\`, or \`remove:\`.
- Treat these comments as instructions to change the markdown, not as messages to answer.
- Apply the requested edit directly in the markdown.
- After applying the edit, remove the resolved thread from the file, including the root \`question:\`, prior \`answer:\` replies, and the action comment.
- Do not add a new \`answer:\` or confirmation comment for completed actions.`;
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
  return `Review ${input.targetPath} and update it directly.

Scope:
- Work only in ${input.targetPath}.
- Address all unresolved MarkReview comments in this file.
- Answer its MarkReview question threads as needed.
- Apply the requested edits directly in the markdown.
- Remove each addressed MarkReview comment once its requested change is applied.
- Do not remove question comments when answering them.
- Do not edit unrelated files or unrelated comments.

${buildThreadActionRules()}

${buildQuestionReplyRules()}`;
}

export function buildFolderAddressCommentsAgentPrompt(
  input: FolderAddressCommentsPromptInput,
): string {
  const targetList = input.targets
    .map((target) => `- ${target.filePath}`)
    .join("\n");

  return `Review these markdown files and update them directly.

Scope:
- Work only in the listed markdown files.
- Review these files:
${targetList}
- Address all unresolved MarkReview comments in those files.
- Answer their MarkReview question threads as needed.
- Apply the requested edits directly in the markdown files.
- Remove each addressed MarkReview comment once its requested change is applied.
- Do not remove question comments when answering them.
- Do not edit unrelated files or unrelated comments.

${buildThreadActionRules()}

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
