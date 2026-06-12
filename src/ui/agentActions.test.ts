import { describe, expect, it } from "vitest";
import { getQuestionThreadAgentAction } from "./agentActions";

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

  it("uses copy-prompt mode until question-thread runs are wired", () => {
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
