import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

import { Header } from "./index";
import {
  makeShare,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
});

describe("Header — Push update button", () => {
  it("shows Push update when there are active shares", () => {
    setTestState({
      shares: [makeShare()],
      fileName: "readme.md",
    });
    render(<Header />);
    expect(
      screen.getByRole("button", { name: /Push update/i }),
    ).toBeInTheDocument();
  });

  it("hides Push update when there are no shares", () => {
    setTestState({
      shares: [],
      fileName: "readme.md",
    });
    render(<Header />);
    expect(
      screen.queryByRole("button", { name: /Push update/i }),
    ).not.toBeInTheDocument();
  });

  it("hides Push update when all shares are expired", () => {
    const expiredShare = makeShare({
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });
    setTestState({
      shares: [expiredShare],
      fileName: "readme.md",
    });
    render(<Header />);
    expect(
      screen.queryByRole("button", { name: /Push update/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Push update when at least one share is active among expired ones", () => {
    const expiredShare = makeShare({
      docId: "expired-doc",
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });
    const activeShare = makeShare({
      docId: "active-doc",
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    setTestState({
      shares: [expiredShare, activeShare],
      fileName: "readme.md",
    });
    render(<Header />);
    expect(
      screen.getByRole("button", { name: /Push update/i }),
    ).toBeInTheDocument();
  });

  it("does not show Push update in peer mode", () => {
    setTestState(
      { shares: [makeShare()], fileName: "readme.md" },
      { isPeerMode: true, peerFileName: "readme.md" },
    );
    render(<Header peerMode />);
    expect(
      screen.queryByRole("button", { name: /Push update/i }),
    ).not.toBeInTheDocument();
  });
});
