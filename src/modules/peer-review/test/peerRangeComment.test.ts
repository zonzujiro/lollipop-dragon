import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../../store";
import { resetTestStore } from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
  useAppStore.setState({
    peerName: "Nina",
    documentUpdateAvailable: false,
  });
});

describe("peer range comments", () => {
  it("stores a versioned durable quote anchor", () => {
    useAppStore.getState().postPeerComment({
      blockIndex: 2,
      type: "fix",
      text: "Tighten this sentence",
      path: "docs/review.md",
      anchor: { quote: "selected sentence", occurrence: 2 },
    });

    expect(useAppStore.getState().myPeerComments[0]).toMatchObject({
      peerName: "Nina",
      path: "docs/review.md",
      blockRef: {
        blockIndex: 2,
        anchorVersion: 1,
        quote: "selected sentence",
        occurrence: 2,
      },
    });
  });
});
