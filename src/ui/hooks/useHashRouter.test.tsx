import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

import { useHashRouter } from "./useHashRouter";
import { useAppStore } from "../../store";
import { resetTestStore, setTestState } from "../../testing/testHelpers";

beforeEach(() => {
  window.location.hash = "";
  resetTestStore();
  setTestState({}, { isPeerMode: false });
  vi.restoreAllMocks();
});

describe("useHashRouter", () => {
  it("leaves peer mode before restoring host workspaces", async () => {
    const restoreTabs = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ isPeerMode: true, restoreTabs });

    renderHook(() => useHashRouter());

    await waitFor(() => {
      expect(useAppStore.getState().isPeerMode).toBe(false);
      expect(restoreTabs).toHaveBeenCalledOnce();
    });
  });
});
