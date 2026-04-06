import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../../store";
import { resetTestStore } from "../../../test/testHelpers";

describe("peer-review state actions", () => {
  beforeEach(() => {
    resetTestStore();
  });

  it("sets peerName in state", () => {
    useAppStore.getState().setPeerName("Bob");
    expect(useAppStore.getState().peerName).toBe("Bob");
  });
});
