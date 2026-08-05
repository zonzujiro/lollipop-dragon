import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../../store";
import { makePeerComment, resetTestStore } from "../../../testing/testHelpers";

describe("peer-review state actions", () => {
  beforeEach(() => {
    resetTestStore();
  });

  it("sets peerName and renames unsent comments", () => {
    useAppStore.setState({
      peerName: "Alice",
      myPeerComments: [makePeerComment({ id: "draft-1", peerName: "Alice" })],
    });

    useAppStore.getState().setPeerName("Bob");

    expect(useAppStore.getState().peerName).toBe("Bob");
    expect(useAppStore.getState().myPeerComments[0]?.peerName).toBe("Bob");
    expect(localStorage.getItem("markreview-store")).toContain(
      '"peerName":"Bob"',
    );
  });

  it("preserves submitted comment authors when the reviewer name changes", () => {
    useAppStore.setState({
      peerName: "Alice",
      myPeerComments: [
        makePeerComment({ id: "submitted-1", peerName: "Alice" }),
        makePeerComment({ id: "draft-1", peerName: "Alice" }),
      ],
      submittedPeerCommentIds: ["submitted-1"],
    });

    useAppStore.getState().setPeerName("Bob");

    expect(useAppStore.getState().myPeerComments).toEqual([
      expect.objectContaining({ id: "submitted-1", peerName: "Alice" }),
      expect.objectContaining({ id: "draft-1", peerName: "Bob" }),
    ]);
  });

  it("rejects an edited peer comment that exceeds the input safety limit", () => {
    useAppStore.setState({
      myPeerComments: [makePeerComment({ id: "draft-1", text: "Original" })],
    });

    useAppStore
      .getState()
      .editPeerComment("draft-1", "fix", "x".repeat(400 * 1024 + 1));

    expect(useAppStore.getState().myPeerComments[0]?.text).toBe("Original");
  });
});
