import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/sharing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../modules/sharing")>();
  return {
    ...actual,
    syncActiveShares: vi.fn(),
    updateShare: vi.fn(),
  };
});

vi.mock("../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

vi.mock("../services/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/crypto")>();
  return {
    ...actual,
    base64urlToKey: vi.fn().mockImplementation(async () => actual.generateKey()),
    docIdFromKey: vi.fn().mockResolvedValue("mock-doc-id"),
  };
});

vi.mock("../modules/relay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../modules/relay")>();
  return {
    ...actual,
    getRelay: () => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      hasActiveSubscriptions: () => false,
      isSubscribed: () => false,
    }),
    ensureRelaySubscriptions: vi.fn(),
    startRelayForDoc: vi.fn(),
    unsubscribeFromDoc: vi.fn(),
    relayCommentAdd: vi.fn(),
    relayCommentResolve: vi.fn(),
    isDocSubscribed: () => false,
  };
});

import { CommentPanel } from "../components/CommentPanel";
import type { SharePayload } from "../types/share";
import {
  makePeerComment,
  resetTestStore,
  setTestState,
} from "./testHelpers";

beforeEach(() => {
  resetTestStore();
});

afterEach(() => {
  window.location.hash = "";
});

describe("CommentPanel peer mode", () => {
  it("filters comments by peerActiveFilePath", () => {
    const firstComment = makePeerComment({
      text: "comment on readme",
      path: "readme.md",
    });
    const secondComment = makePeerComment({
      text: "comment on other",
      path: "other.md",
    });
    setTestState(
      { commentPanelOpen: true },
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerCommentPanelOpen: true,
        myPeerComments: [firstComment, secondComment],
      },
    );

    render(<CommentPanel peerMode />);

    expect(screen.getByText("comment on readme")).toBeInTheDocument();
    expect(screen.queryByText("comment on other")).not.toBeInTheDocument();
  });

  it("shows all peer comments for multi-file shares", () => {
    const firstComment = makePeerComment({
      text: "readme comment",
      path: "readme.md",
    });
    const secondComment = makePeerComment({
      text: "other comment",
      path: "other.md",
    });
    const sharedContent = {
      version: "2.0",
      created_at: new Date().toISOString(),
      tree: { "readme.md": "# Hello", "other.md": "# Other" },
    } satisfies SharePayload;
    setTestState(
      { commentPanelOpen: true },
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerCommentPanelOpen: true,
        myPeerComments: [firstComment, secondComment],
        sharedContent,
      },
    );

    render(<CommentPanel peerMode />);

    expect(screen.getByText("readme comment")).toBeInTheDocument();
    expect(screen.getByText("other comment")).toBeInTheDocument();
  });
});
