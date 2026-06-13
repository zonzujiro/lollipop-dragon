export type QuestionThreadAgentActionKind = "copy_prompt" | "run_agent";
export type AddressCommentsAgentActionKind = "copy_prompt" | "run_agent";
export type PeerCommentsAgentActionKind = "copy_prompt" | "run_agent";

export interface QuestionThreadAgentAction {
  kind: QuestionThreadAgentActionKind;
  label: string;
  title: string;
}

export interface AddressCommentsAgentAction {
  kind: AddressCommentsAgentActionKind;
  label: string;
  title: string;
}

export interface PeerCommentsAgentAction {
  kind: PeerCommentsAgentActionKind;
  label: string;
  title: string;
}

export interface AgentActionCapabilities {
  canRunAgent: boolean;
  canStartQuestionThreadRun: boolean;
}

export interface AddressCommentsAgentActionCapabilities {
  canRunAgent: boolean;
  canStartAddressCommentsRun: boolean;
}

export interface PeerCommentsAgentActionCapabilities {
  canRunAgent: boolean;
  canStartPeerCommentsRun: boolean;
}

export function getAddressCommentsAgentAction(
  capabilities: AddressCommentsAgentActionCapabilities,
): AddressCommentsAgentAction {
  if (capabilities.canRunAgent && capabilities.canStartAddressCommentsRun) {
    return {
      kind: "run_agent",
      label: "Address comments",
      title: "Ask the local agent to address unresolved comments",
    };
  }

  return {
    kind: "copy_prompt",
    label: "Copy review prompt",
    title: "Copy instructions for addressing unresolved comments",
  };
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

export function getPeerCommentsAgentAction(
  capabilities: PeerCommentsAgentActionCapabilities,
): PeerCommentsAgentAction {
  if (capabilities.canRunAgent && capabilities.canStartPeerCommentsRun) {
    return {
      kind: "run_agent",
      label: "Ask agent",
      title: "Ask the local agent to review pending peer comments",
    };
  }

  return {
    kind: "copy_prompt",
    label: "Copy agent prompt",
    title: "Copy instructions for reviewing pending peer comments",
  };
}
