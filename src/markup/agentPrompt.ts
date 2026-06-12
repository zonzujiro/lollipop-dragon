interface AddressCommentsPromptComment {
  id: string;
  type: string;
  text: string;
}

interface AddressCommentsPromptInput {
  targetPath: string;
  comments: AddressCommentsPromptComment[];
}

interface FolderAddressCommentsPromptTarget {
  filePath: string;
  comments: AddressCommentsPromptComment[];
}

interface FolderAddressCommentsPromptInput {
  targets: FolderAddressCommentsPromptTarget[];
}

export function buildAgentReplyPrompt(): string {
  return `Review this markdown file and answer MarkReview threaded questions inline.

Rules:
- Leave each original question comment unchanged.
- Reply with a separate inline CriticMarkup comment near the same text block.
- Use the \`answer:\` prefix in every reply.
- Keep the question's existing \`thread\` value.
- Set \`replyTo\` to the question's \`id\`.
- Give your reply its own unique \`id\`.
- Add your agent name in \`author\` (for example \`Codex\` or \`Cursor\`).
- Keep answers concise, specific, and grounded in the referenced text.

Example question:
{>>question: Why is this section needed? [markreview id="mr-question-1" thread="mr-question-1"]<<}

Example answer:
{>>answer: This section explains the reconnect fallback path after a missed live event. [markreview id="mr-answer-1" thread="mr-question-1" replyTo="mr-question-1" author="Codex"]<<}`;
}

export function buildAddressCommentsAgentPrompt(
  input: AddressCommentsPromptInput,
): string {
  const commentList = input.comments
    .map((comment) => `- ${comment.id} (${comment.type}): ${comment.text}`)
    .join("\n");

  return `Review this markdown file and address the listed MarkReview comments.

Scope:
- Work only in ${input.targetPath}.
- Address only these unresolved comment ids:
${commentList}
- Apply the requested edits directly in the markdown.
- Remove each addressed MarkReview comment once its requested change is applied.
- Do not answer threaded question comments in this run.
- Do not edit unrelated files or unrelated comments.`;
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
      return `- ${target.filePath}\n${commentList}`;
    })
    .join("\n");

  return `Review this markdown folder and address the listed MarkReview comments.

Scope:
- Work only in the listed markdown files.
- Address only these unresolved comment ids:
${targetList}
- Apply the requested edits directly in the markdown files.
- Remove each addressed MarkReview comment once its requested change is applied.
- Do not answer threaded question comments in this run.
- Do not edit unrelated files or unrelated comments.`;
}
