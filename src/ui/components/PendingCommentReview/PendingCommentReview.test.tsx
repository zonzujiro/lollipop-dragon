import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makePeerComment,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";
import { useAppStore } from "../../../store";
import { PendingCommentReview } from "./PendingCommentReview";

beforeEach(() => {
  resetTestStore();
  setTestState({
    pendingComments: {
      "doc-1": [
        makePeerComment({
          id: "peer-1",
          peerName: "Alice",
          path: "docs/spec.md",
          blockRef: {
            blockIndex: 0,
            contentPreview: "Intro paragraph",
          },
          commentType: "fix",
          text: "Fix the intro",
        }),
      ],
    },
  });
  vi.restoreAllMocks();
});

describe("PendingCommentReview", () => {
  it("copies a pending peer comments prompt when local agent execution is unavailable", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    render(<PendingCommentReview docId="doc-1" />);

    await user.click(screen.getByRole("button", { name: "Copy agent prompt" }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "Review these pending peer comments",
    );
    expect(writeText.mock.calls[0]?.[0]).toContain("- docs/spec.md");
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "  - peer-1 (fix) from Alice at block 1: Fix the intro",
    );
    expect(useAppStore.getState().toast).toBe("Agent prompt copied");
  });

  it("hides the agent action while the tab has an active run", async () => {
    const run = useAppStore.getState().createAgentRun({
      tabId: "test-tab",
      taskKind: "review_peer_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["docs/spec.md#peer-1"],
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "running",
      terminalAttachmentId: "native-run-1",
    });

    render(<PendingCommentReview docId="doc-1" />);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Copy agent prompt" }),
      ).not.toBeInTheDocument();
    });
  });
});
