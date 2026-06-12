export type QuestionThreadAgentActionKind = "copy_prompt" | "run_agent";

export interface QuestionThreadAgentAction {
  kind: QuestionThreadAgentActionKind;
  label: string;
  title: string;
}

export interface AgentActionCapabilities {
  canRunAgent: boolean;
  canStartQuestionThreadRun: boolean;
}

export function getQuestionThreadAgentAction(
  capabilities: AgentActionCapabilities,
): QuestionThreadAgentAction {
  if (capabilities.canRunAgent && capabilities.canStartQuestionThreadRun) {
    return {
      kind: "run_agent",
      label: "Ask agent",
      title: "Ask the local agent to answer threaded questions",
    };
  }

  return {
    kind: "copy_prompt",
    label: "Copy agent prompt",
    title: "Copy instructions for answering threaded questions",
  };
}
