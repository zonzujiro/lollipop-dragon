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
