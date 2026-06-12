import { describe, expect, it } from "vitest";
import {
  getAddressCommentsAgentAction,
  getQuestionThreadAgentAction,
} from "./agentActions";

describe("getAddressCommentsAgentAction", () => {
  it("uses copy-prompt mode when local agent execution is unavailable", () => {
    expect(
      getAddressCommentsAgentAction({
        canRunAgent: false,
        canStartAddressCommentsRun: false,
      }),
    ).toEqual({
      kind: "copy_prompt",
      label: "Copy review prompt",
      title: "Copy instructions for addressing unresolved comments",
    });
  });

  it("uses copy-prompt mode when address-comment runs are unavailable", () => {
    expect(
      getAddressCommentsAgentAction({
        canRunAgent: true,
        canStartAddressCommentsRun: false,
      }).kind,
    ).toBe("copy_prompt");
  });

  it("uses run-agent mode when both capabilities are available", () => {
    expect(
      getAddressCommentsAgentAction({
        canRunAgent: true,
        canStartAddressCommentsRun: true,
      }),
    ).toEqual({
      kind: "run_agent",
      label: "Address comments",
      title: "Ask the local agent to address unresolved comments",
    });
  });
});

describe("getQuestionThreadAgentAction", () => {
  it("uses copy-prompt mode when local agent execution is unavailable", () => {
    expect(
      getQuestionThreadAgentAction({
        canRunAgent: false,
        canStartQuestionThreadRun: false,
      }),
    ).toEqual({
      kind: "copy_prompt",
      label: "Copy agent prompt",
      title: "Copy instructions for answering threaded questions",
    });
  });

  it("uses copy-prompt mode when question-thread runs are unavailable", () => {
    expect(
      getQuestionThreadAgentAction({
        canRunAgent: true,
        canStartQuestionThreadRun: false,
      }).kind,
    ).toBe("copy_prompt");
  });

  it("uses run-agent mode when both capabilities are available", () => {
    expect(
      getQuestionThreadAgentAction({
        canRunAgent: true,
        canStartQuestionThreadRun: true,
      }),
    ).toEqual({
      kind: "run_agent",
      label: "Ask agent",
      title: "Ask the local agent to answer threaded questions",
    });
  });
});
